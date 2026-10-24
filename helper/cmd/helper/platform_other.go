//go:build !windows

package main

import (
	"os"
	"os/exec"
	"runtime"
)

func hideWindow(_ *exec.Cmd) {}

func assignKillOnClose(_ int) (func(), error) {
	return func() {}, nil
}

func killTree(pid int) {
	process, err := os.FindProcess(pid)
	if err != nil {
		return
	}
	_ = process.Kill()
}

func openFolder(path string) error {
	command := "xdg-open"
	if runtime.GOOS == "darwin" {
		command = "open"
	}
	return exec.Command(command, path).Start()
}
