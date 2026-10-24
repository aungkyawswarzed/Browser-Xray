package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"time"
)

type App struct {
	mu       sync.Mutex
	dataDir  string
	helper   string
	xray     string
	proc     *xrayProcess
	version  string
	versionO sync.Once
}

type xrayProcess struct {
	cmd       *exec.Cmd
	done      chan struct{}
	waitErr   error
	jobCloser func()
	logFile   *os.File
}

func (p *xrayProcess) exited() (bool, error) {
	select {
	case <-p.done:
		return true, p.waitErr
	default:
		return false, nil
	}
}

func NewApp(dataDir string) *App {
	helperPath, err := os.Executable()
	if err != nil {
		helperPath = "browser-xray-helper.exe"
	}
	app := &App{
		dataDir: dataDir,
		helper:  helperPath,
		xray:    findXray(filepath.Dir(helperPath), dataDir),
	}
	_ = os.MkdirAll(filepath.Join(dataDir, "runtime"), 0o700)
	_ = os.MkdirAll(filepath.Join(dataDir, "logs"), 0o700)
	return app
}

func (a *App) Shutdown() {
	a.mu.Lock()
	defer a.mu.Unlock()
	a.stopLocked()
}

func (a *App) Handle(payload []byte) Response {
	var request Request
	if err := json.Unmarshal(payload, &request); err != nil {
		return Response{Error: "The helper received an invalid request."}
	}
	response := a.dispatch(request)
	response.ID = request.ID
	return response
}

func (a *App) dispatch(request Request) Response {
	switch request.Cmd {
	case "ping":
		return a.ping()
	case "status":
		return a.status()
	case "connect":
		return a.connect(request.Profile)
	case "disconnect":
		return a.disconnect()
	case "validate":
		return a.validate(request.Profile)
	case "openDataDir":
		if err := openFolder(a.dataDir); err != nil {
			return errorResponse(err, "open_failed")
		}
		return Response{OK: true}
	case "diagnostics":
		return Response{OK: true, Diagnostics: a.diagnostics()}
	default:
		return Response{Error: "Unknown helper command.", Code: "unknown_command"}
	}
}

func (a *App) ping() Response {
	xrayVersion := a.xrayVersion()
	xrayPath := a.xray
	if _, err := os.Stat(xrayPath); err != nil {
		xrayPath = ""
	}
	if xrayVersion == "" {
		log.Printf("xray core not available at %s", a.xray)
	}
	return Response{
		OK:            true,
		HelperVersion: helperVersion,
		XrayVersion:   xrayVersion,
		DataDir:       a.dataDir,
		HelperPath:    a.helper,
		XrayPath:      xrayPath,
		Platform:      runtime.GOOS + "/" + runtime.GOARCH,
	}
}

func (a *App) status() Response {
	a.mu.Lock()
	defer a.mu.Unlock()

	state, err := a.readState()
	if err != nil || state.Port == 0 {
		return Response{OK: true, Running: false}
	}
	if !tcpAlive(state.Port) {
		a.clearState()
		return Response{OK: true, Running: false}
	}
	return Response{
		OK:        true,
		Running:   true,
		Port:      state.Port,
		PID:       state.PID,
		ProfileID: state.ProfileID,
	}
}

func (a *App) connect(rawProfile json.RawMessage) Response {
	var profile Profile
	if len(rawProfile) == 0 || json.Unmarshal(rawProfile, &profile) != nil {
		return errorResponse(fmt.Errorf("the server profile is missing or invalid"), "invalid_profile")
	}
	if _, err := os.Stat(a.xray); err != nil {
		return errorResponse(
			fmt.Errorf("xray.exe was not found next to the helper. Re-run the helper installer"),
			"missing_core",
		)
	}

	a.mu.Lock()
	defer a.mu.Unlock()

	port, err := allocatePort()
	if err != nil {
		return errorResponse(fmt.Errorf("could not reserve a local proxy port: %w", err), "port")
	}

	configPath := filepath.Join(a.dataDir, "runtime", "config.json")
	config, err := BuildXrayConfig(profile, port, filepath.Join(a.dataDir, "logs", "xray-error.log"))
	if err != nil {
		return errorResponse(fmt.Errorf("invalid server configuration: %w", err), "invalid_profile")
	}
	if err := writeFileAtomic(configPath, config); err != nil {
		return errorResponse(fmt.Errorf("could not write the Xray configuration: %w", err), "config")
	}

	if err := a.testConfig(configPath); err != nil {
		return errorResponse(err, "config_test")
	}

	a.stopLocked()

	proc, err := a.startXray(configPath)
	if err != nil {
		return errorResponse(err, "start_failed")
	}
	a.proc = proc

	if err := a.waitForProxy(port, proc); err != nil {
		a.stopLocked()
		return errorResponse(err, "start_failed")
	}

	state := State{
		PID:       proc.cmd.Process.Pid,
		Port:      port,
		ProfileID: profile.ID,
		StartedAt: time.Now().UTC().Format(time.RFC3339),
	}
	if err := a.writeState(state); err != nil {
		a.stopLocked()
		return errorResponse(fmt.Errorf("could not save the helper state: %w", err), "state")
	}

	log.Printf("connected to %s via %s:%d on 127.0.0.1:%d (pid %d)", profile.Name, profile.Address, profile.Port, port, state.PID)
	return Response{
		OK:        true,
		Port:      port,
		PID:       state.PID,
		ProfileID: profile.ID,
	}
}

func (a *App) validate(rawProfile json.RawMessage) Response {
	var profile Profile
	if len(rawProfile) == 0 || json.Unmarshal(rawProfile, &profile) != nil {
		return errorResponse(fmt.Errorf("the server profile is missing or invalid"), "invalid_profile")
	}
	port, err := allocatePort()
	if err != nil {
		return errorResponse(err, "port")
	}
	config, err := BuildXrayConfig(profile, port, filepath.Join(a.dataDir, "logs", "xray-error.log"))
	if err != nil {
		return errorResponse(err, "invalid_profile")
	}
	tempPath := filepath.Join(a.dataDir, "runtime", "validate.json")
	if err := writeFileAtomic(tempPath, config); err != nil {
		return errorResponse(err, "config")
	}
	defer os.Remove(tempPath)
	if _, err := os.Stat(a.xray); err != nil {
		return errorResponse(fmt.Errorf("xray.exe was not found next to the helper"), "missing_core")
	}
	if err := a.testConfig(tempPath); err != nil {
		return errorResponse(err, "config_test")
	}
	return Response{OK: true}
}

func (a *App) disconnect() Response {
	a.mu.Lock()
	defer a.mu.Unlock()
	a.stopLocked()
	return Response{OK: true}
}

func (a *App) startXray(configPath string) (*xrayProcess, error) {
	logPath := filepath.Join(a.dataDir, "logs", "xray.log")
	logFile, err := os.OpenFile(logPath, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0o600)
	if err != nil {
		return nil, fmt.Errorf("could not open the Xray log: %w", err)
	}

	cmd := exec.Command(a.xray, "run", "-c", configPath)
	cmd.Dir = a.dataDir
	hideWindow(cmd)
	cmd.Stdout = logFile
	cmd.Stderr = logFile

	if err := cmd.Start(); err != nil {
		logFile.Close()
		return nil, fmt.Errorf("could not start Xray: %w", err)
	}

	proc := &xrayProcess{
		cmd:     cmd,
		done:    make(chan struct{}),
		logFile: logFile,
	}

	closer, err := assignKillOnClose(cmd.Process.Pid)
	if err != nil {
		log.Printf("job object setup failed (tunnel may survive a helper crash): %v", err)
	} else {
		proc.jobCloser = closer
	}

	go func() {
		waitErr := cmd.Wait()
		proc.waitErr = waitErr
		close(proc.done)
		logFile.Close()
		log.Printf("xray exited: %v", waitErr)
	}()

	return proc, nil
}

func (a *App) waitForProxy(port int, proc *xrayProcess) error {
	address := fmt.Sprintf("127.0.0.1:%d", port)
	deadline := time.Now().Add(12 * time.Second)

	for time.Now().Before(deadline) {
		if exited, err := proc.exited(); exited {
			return fmt.Errorf(
				"Xray exited during startup (%v).\n%s",
				err,
				tail(filepath.Join(a.dataDir, "logs", "xray.log"), 4000),
			)
		}

		connection, err := net.DialTimeout("tcp", address, 250*time.Millisecond)
		if err == nil {
			connection.Close()
			time.Sleep(120 * time.Millisecond)
			if exited, err := proc.exited(); exited {
				return fmt.Errorf(
					"Xray stopped immediately after starting (%v).\n%s",
					err,
					tail(filepath.Join(a.dataDir, "logs", "xray.log"), 4000),
				)
			}
			return nil
		}
		time.Sleep(90 * time.Millisecond)
	}

	return fmt.Errorf(
		"Xray did not start listening on %s within 12 seconds.\n%s",
		address,
		tail(filepath.Join(a.dataDir, "logs", "xray.log"), 4000),
	)
}

func (a *App) testConfig(configPath string) error {
	ctx, cancel := context.WithTimeout(context.Background(), 12*time.Second)
	defer cancel()

	cmd := exec.CommandContext(ctx, a.xray, "run", "-test", "-c", configPath)
	cmd.Dir = a.dataDir
	hideWindow(cmd)
	output, err := cmd.CombinedOutput()

	if ctx.Err() == context.DeadlineExceeded {
		return fmt.Errorf("Xray configuration validation timed out")
	}
	if err != nil {
		message := strings.TrimSpace(string(output))
		if len(message) > 3000 {
			message = message[len(message)-3000:]
		}
		if message == "" {
			message = err.Error()
		}
		return fmt.Errorf("Xray rejected the configuration: %s", message)
	}
	return nil
}

func (a *App) stopLocked() {
	if a.proc != nil {
		proc := a.proc
		a.proc = nil
		if exited, _ := proc.exited(); !exited {
			_ = proc.cmd.Process.Kill()
			select {
			case <-proc.done:
			case <-time.After(3 * time.Second):
				log.Printf("xray pid %d did not stop in time", proc.cmd.Process.Pid)
			}
		}
		if proc.jobCloser != nil {
			proc.jobCloser()
		}
	}

	state, err := a.readState()
	if err == nil && state.PID > 0 && state.Port > 0 && tcpAlive(state.Port) {
		log.Printf("stopping stale xray pid %d on port %d", state.PID, state.Port)
		killTree(state.PID)
	}
	a.clearState()
}

func (a *App) xrayVersion() string {
	a.versionO.Do(func() {
		if _, err := os.Stat(a.xray); err != nil {
			return
		}
		ctx, cancel := context.WithTimeout(context.Background(), 4*time.Second)
		defer cancel()
		cmd := exec.CommandContext(ctx, a.xray, "version")
		hideWindow(cmd)
		output, err := cmd.Output()
		if err != nil {
			log.Printf("could not read the Xray version: %v", err)
			return
		}
		line := strings.SplitN(string(output), "\n", 2)[0]
		fields := strings.Fields(line)
		if len(fields) >= 2 && strings.EqualFold(fields[0], "xray") {
			a.version = fields[1]
			return
		}
		a.version = strings.TrimSpace(line)
	})
	return a.version
}

func (a *App) diagnostics() string {
	state, _ := a.readState()
	alive := state.Port > 0 && tcpAlive(state.Port)
	var builder strings.Builder
	fmt.Fprintf(&builder, "Helper: %s (pid %d)\n", helperVersion, os.Getpid())
	fmt.Fprintf(&builder, "Xray core: %s\n", a.xrayVersion())
	fmt.Fprintf(&builder, "Platform: %s/%s\n", runtime.GOOS, runtime.GOARCH)
	fmt.Fprintf(&builder, "Data directory: %s\n", a.dataDir)
	fmt.Fprintf(&builder, "Helper path: %s\n", a.helper)
	fmt.Fprintf(&builder, "Xray path: %s\n", a.xray)
	fmt.Fprintf(&builder, "State: pid=%d port=%d profile=%s alive=%t\n", state.PID, state.Port, state.ProfileID, alive)
	builder.WriteString("\n--- xray.log ---\n")
	builder.WriteString(tail(filepath.Join(a.dataDir, "logs", "xray.log"), 5000))
	builder.WriteString("\n--- xray-error.log ---\n")
	builder.WriteString(tail(filepath.Join(a.dataDir, "logs", "xray-error.log"), 3000))
	builder.WriteString("\n--- helper.log ---\n")
	builder.WriteString(tail(filepath.Join(a.dataDir, "logs", "helper.log"), 3000))
	return builder.String()
}

func (a *App) statePath() string {
	return filepath.Join(a.dataDir, "runtime", "state.json")
}

func (a *App) readState() (State, error) {
	var state State
	payload, err := os.ReadFile(a.statePath())
	if err != nil {
		return state, err
	}
	err = json.Unmarshal(payload, &state)
	return state, err
}

func (a *App) writeState(state State) error {
	payload, err := json.MarshalIndent(state, "", "  ")
	if err != nil {
		return err
	}
	return writeFileAtomic(a.statePath(), payload)
}

func (a *App) clearState() {
	_ = os.Remove(a.statePath())
}

func allocatePort() (int, error) {
	listener, err := net.Listen("tcp4", "127.0.0.1:0")
	if err != nil {
		return 0, err
	}
	defer listener.Close()
	address, ok := listener.Addr().(*net.TCPAddr)
	if !ok {
		return 0, fmt.Errorf("unexpected listener address")
	}
	return address.Port, nil
}

func tcpAlive(port int) bool {
	connection, err := net.DialTimeout("tcp", fmt.Sprintf("127.0.0.1:%d", port), 350*time.Millisecond)
	if err != nil {
		return false
	}
	connection.Close()
	return true
}

func writeFileAtomic(path string, payload []byte) error {
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return err
	}
	temp := path + ".tmp"
	if err := os.WriteFile(temp, payload, 0o600); err != nil {
		return err
	}
	return os.Rename(temp, path)
}

func tail(path string, maxBytes int64) string {
	file, err := os.Open(path)
	if err != nil {
		return "(not available)"
	}
	defer file.Close()

	info, err := file.Stat()
	if err != nil {
		return "(not available)"
	}
	size := info.Size()
	if size == 0 {
		return "(empty)"
	}
	offset := int64(0)
	if size > maxBytes {
		offset = size - maxBytes
	}
	if _, err := file.Seek(offset, 0); err != nil {
		return "(not available)"
	}
	payload := make([]byte, size-offset)
	if _, err := file.Read(payload); err != nil {
		return "(not available)"
	}
	return strings.TrimSpace(string(payload))
}

func findXray(helperDir, dataDir string) string {
	binary := "xray"
	if runtime.GOOS == "windows" {
		binary = "xray.exe"
	}
	candidates := []string{}
	if custom := os.Getenv("BROWSER_XRAY_CORE"); custom != "" {
		candidates = append(candidates, custom)
	}
	candidates = append(candidates,
		filepath.Join(helperDir, binary),
		filepath.Join(helperDir, "core", binary),
		filepath.Join(dataDir, binary),
		filepath.Join(dataDir, "bin", binary),
	)
	for _, candidate := range candidates {
		if info, err := os.Stat(candidate); err == nil && !info.IsDir() {
			return candidate
		}
	}
	return filepath.Join(helperDir, binary)
}

func errorResponse(err error, code string) Response {
	return Response{OK: false, Error: err.Error(), Code: code}
}
