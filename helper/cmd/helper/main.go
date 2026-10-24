package main

import (
	"bufio"
	"io"
	"log"
	"os"
	"path/filepath"
)

const helperVersion = "1.0.1"

func main() {
	dataDir, err := resolveDataDir()
	if err != nil {
		log.Printf("cannot resolve data directory: %v", err)
		return
	}

	for _, directory := range []string{dataDir, filepath.Join(dataDir, "logs"), filepath.Join(dataDir, "runtime")} {
		if err := os.MkdirAll(directory, 0o700); err != nil {
			log.Printf("cannot create %s: %v", directory, err)
			return
		}
	}

	logFile, err := os.OpenFile(
		filepath.Join(dataDir, "logs", "helper.log"),
		os.O_CREATE|os.O_APPEND|os.O_WRONLY,
		0o600,
	)
	if err == nil {
		log.SetOutput(logFile)
		defer logFile.Close()
	} else {
		log.SetOutput(io.Discard)
	}

	log.Printf("browser-xray helper %s starting (pid %d)", helperVersion, os.Getpid())

	app := NewApp(dataDir)
	defer app.Shutdown()

	reader := bufio.NewReaderSize(os.Stdin, 64*1024)
	writer := bufio.NewWriterSize(os.Stdout, 64*1024)

	for {
		payload, err := readNativeMessage(reader)
		if err != nil {
			if err != io.EOF {
				log.Printf("native message read failed: %v", err)
			}
			break
		}

		response := app.Handle(payload)
		if err := writeNativeMessage(writer, response); err != nil {
			log.Printf("native message write failed: %v", err)
			break
		}
		if err := writer.Flush(); err != nil {
			log.Printf("stdout flush failed: %v", err)
			break
		}
	}

	log.Printf("native channel closed; stopping")
}

func resolveDataDir() (string, error) {
	if custom := os.Getenv("BROWSER_XRAY_DATA_DIR"); custom != "" {
		return filepath.Abs(custom)
	}
	cache, err := os.UserCacheDir()
	if err == nil && cache != "" {
		return filepath.Join(cache, "BrowserXray"), nil
	}
	executable, exeErr := os.Executable()
	if exeErr != nil {
		return "", exeErr
	}
	return filepath.Join(filepath.Dir(executable), "data"), nil
}
