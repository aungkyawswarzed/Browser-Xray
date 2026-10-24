package main

import (
	"bufio"
	"encoding/binary"
	"encoding/json"
	"fmt"
	"io"
)

const maxNativeMessage = 64 << 20

type Request struct {
	ID      int64           `json:"id"`
	Cmd     string          `json:"cmd"`
	Profile json.RawMessage `json:"profile,omitempty"`
}

type Response struct {
	OK            bool   `json:"ok"`
	ID            int64  `json:"id,omitempty"`
	Error         string `json:"error,omitempty"`
	Code          string `json:"code,omitempty"`
	HelperVersion string `json:"helperVersion,omitempty"`
	XrayVersion   string `json:"xrayVersion,omitempty"`
	DataDir       string `json:"dataDir,omitempty"`
	HelperPath    string `json:"helperPath,omitempty"`
	XrayPath      string `json:"xrayPath,omitempty"`
	Platform      string `json:"platform,omitempty"`
	Port          int    `json:"port,omitempty"`
	PID           int    `json:"pid,omitempty"`
	ProfileID     string `json:"profileId,omitempty"`
	Running       bool   `json:"running,omitempty"`
	Diagnostics   string `json:"diagnostics,omitempty"`
}

type State struct {
	PID       int    `json:"pid"`
	Port      int    `json:"port"`
	ProfileID string `json:"profileId"`
	StartedAt string `json:"startedAt"`
}

func readNativeMessage(reader io.Reader) ([]byte, error) {
	var length uint32
	if err := binary.Read(reader, binary.LittleEndian, &length); err != nil {
		return nil, err
	}
	if length == 0 {
		return nil, fmt.Errorf("empty native message")
	}
	if length > maxNativeMessage {
		return nil, fmt.Errorf("native message too large: %d bytes", length)
	}
	payload := make([]byte, length)
	if _, err := io.ReadFull(reader, payload); err != nil {
		return nil, err
	}
	return payload, nil
}

func writeNativeMessage(writer *bufio.Writer, response Response) error {
	payload, err := json.Marshal(response)
	if err != nil {
		return err
	}
	var header [4]byte
	binary.LittleEndian.PutUint32(header[:], uint32(len(payload)))
	if _, err := writer.Write(header[:]); err != nil {
		return err
	}
	_, err = writer.Write(payload)
	return err
}
