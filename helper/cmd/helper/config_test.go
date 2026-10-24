package main

import (
	"encoding/json"
	"strings"
	"testing"
)

const testErrorLog = `C:\Users\Test\AppData\Local\BrowserXray\logs\xray-error.log`

func decodeConfig(t *testing.T, profile Profile) map[string]any {
	t.Helper()
	payload, err := BuildXrayConfig(profile, 18080, testErrorLog)
	if err != nil {
		t.Fatalf("BuildXrayConfig returned an error: %v", err)
	}
	var config map[string]any
	if err := json.Unmarshal(payload, &config); err != nil {
		t.Fatalf("generated config is not valid JSON: %v", err)
	}
	return config
}

func inboundSettings(t *testing.T, config map[string]any) map[string]any {
	t.Helper()
	inbounds, ok := config["inbounds"].([]any)
	if !ok || len(inbounds) != 1 {
		t.Fatalf("expected exactly one inbound, got %#v", config["inbounds"])
	}
	inbound := inbounds[0].(map[string]any)
	if inbound["listen"] != "127.0.0.1" {
		t.Errorf("inbound should listen on loopback, got %v", inbound["listen"])
	}
	if inbound["protocol"] != "http" {
		t.Errorf("inbound should be HTTP, got %v", inbound["protocol"])
	}
	if inbound["port"].(float64) != 18080 {
		t.Errorf("inbound port = %v, want 18080", inbound["port"])
	}
	return inbound
}

func outboundSettings(t *testing.T, config map[string]any) map[string]any {
	t.Helper()
	outbounds, ok := config["outbounds"].([]any)
	if !ok || len(outbounds) != 1 {
		t.Fatalf("expected exactly one outbound, got %#v", config["outbounds"])
	}
	return outbounds[0].(map[string]any)
}

func TestVLESSRealityConfig(t *testing.T) {
	config := decodeConfig(t, Profile{
		ID:          "profile-1",
		Name:        "Reality",
		Protocol:    "vless",
		Address:     "example.com",
		Port:        443,
		UUID:        "11111111-2222-4333-8444-555555555555",
		Flow:        "xtls-rprx-vision",
		Encryption:  "none",
		Security:    "reality",
		SNI:         "www.example.com",
		Fingerprint: "chrome",
		PublicKey:   "Z84J2IelR9ch3k8VtlVhhs5ycBUlXA7wHBWcBrjqnAw",
		ShortID:     "6ba85179e30d4fc2",
		SpiderX:     "/",
		Network:     "tcp",
	})

	inboundSettings(t, config)
	outbound := outboundSettings(t, config)
	if outbound["protocol"] != "vless" {
		t.Fatalf("outbound protocol = %v", outbound["protocol"])
	}

	stream := outbound["streamSettings"].(map[string]any)
	if stream["security"] != "reality" {
		t.Fatalf("stream security = %v", stream["security"])
	}
	reality := stream["realitySettings"].(map[string]any)
	if reality["serverName"] != "www.example.com" || reality["publicKey"] == "" {
		t.Fatalf("unexpected REALITY settings: %#v", reality)
	}

	vnext := outbound["settings"].(map[string]any)["vnext"].([]any)[0].(map[string]any)
	user := vnext["users"].([]any)[0].(map[string]any)
	if user["flow"] != "xtls-rprx-vision" {
		t.Fatalf("flow = %v", user["flow"])
	}
	if user["encryption"] != "none" {
		t.Fatalf("encryption = %v", user["encryption"])
	}
}

func TestVLESSWebSocketTLSConfig(t *testing.T) {
	config := decodeConfig(t, Profile{
		Protocol:    "vless",
		Address:     "example.com",
		Port:        443,
		UUID:        "11111111-2222-4333-8444-555555555555",
		Security:    "tls",
		SNI:         "example.com",
		Fingerprint: "firefox",
		ALPN:        "h2,http/1.1",
		Network:     "ws",
		Path:        "/socket",
		Host:        "cdn.example.com",
	})

	stream := outboundSettings(t, config)["streamSettings"].(map[string]any)
	ws := stream["wsSettings"].(map[string]any)
	if ws["path"] != "/socket" {
		t.Fatalf("ws path = %v", ws["path"])
	}
	headers := ws["headers"].(map[string]any)
	if headers["Host"] != "cdn.example.com" {
		t.Fatalf("ws Host = %v", headers["Host"])
	}
	tls := stream["tlsSettings"].(map[string]any)
	alpn := tls["alpn"].([]any)
	if len(alpn) != 2 || alpn[0] != "h2" {
		t.Fatalf("unexpected ALPN: %#v", alpn)
	}
}

func TestVMessGRPCConfig(t *testing.T) {
	config := decodeConfig(t, Profile{
		Protocol:    "vmess",
		Address:     "vmess.example.com",
		Port:        8443,
		UUID:        "11111111-2222-4333-8444-555555555555",
		AlterID:     0,
		Cipher:      "auto",
		Security:    "tls",
		SNI:         "vmess.example.com",
		Network:     "grpc",
		ServiceName: "grpc-service",
	})

	stream := outboundSettings(t, config)["streamSettings"].(map[string]any)
	grpc := stream["grpcSettings"].(map[string]any)
	if grpc["serviceName"] != "grpc-service" {
		t.Fatalf("grpc serviceName = %v", grpc["serviceName"])
	}
}

func TestTrojanWebSocketConfig(t *testing.T) {
	config := decodeConfig(t, Profile{
		Protocol: "trojan",
		Address:  "trojan.example.com",
		Port:     443,
		Password: "secret",
		Security: "tls",
		SNI:      "trojan.example.com",
		Network:  "ws",
		Path:     "/trojan",
	})

	outbound := outboundSettings(t, config)
	servers := outbound["settings"].(map[string]any)["servers"].([]any)
	if servers[0].(map[string]any)["password"] != "secret" {
		t.Fatalf("unexpected trojan password")
	}
	if outbound["streamSettings"].(map[string]any)["network"] != "ws" {
		t.Fatalf("unexpected network")
	}
}

func TestShadowsocksConfig(t *testing.T) {
	config := decodeConfig(t, Profile{
		Protocol: "ss",
		Address:  "ss.example.com",
		Port:     8388,
		Password: "secret",
		Cipher:   "aes-256-gcm",
		Security: "none",
		Network:  "tcp",
	})

	outbound := outboundSettings(t, config)
	if outbound["protocol"] != "shadowsocks" {
		t.Fatalf("protocol = %v", outbound["protocol"])
	}
	if _, ok := outbound["streamSettings"]; ok {
		t.Fatalf("Shadowsocks config should not include streamSettings")
	}
	servers := outbound["settings"].(map[string]any)["servers"].([]any)
	method := servers[0].(map[string]any)["method"]
	if method != "aes-256-gcm" {
		t.Fatalf("method = %v", method)
	}
}

func TestXHTTPConfig(t *testing.T) {
	config := decodeConfig(t, Profile{
		Protocol: "vless",
		Address:  "example.com",
		Port:     443,
		UUID:     "11111111-2222-4333-8444-555555555555",
		Security: "tls",
		SNI:      "example.com",
		Network:  "xhttp",
		Path:     "/xhttp",
		Host:     "example.com",
	})

	stream := outboundSettings(t, config)["streamSettings"].(map[string]any)
	xhttp := stream["xhttpSettings"].(map[string]any)
	if xhttp["path"] != "/xhttp" || xhttp["mode"] != "auto" {
		t.Fatalf("unexpected xhttp settings: %#v", xhttp)
	}
}

func TestInvalidProfiles(t *testing.T) {
	cases := []struct {
		name    string
		profile Profile
		want    string
	}{
		{
			name: "missing uuid",
			profile: Profile{
				Protocol: "vless", Address: "example.com", Port: 443, Security: "tls",
			},
			want: "UUID",
		},
		{
			name: "unsupported transport",
			profile: Profile{
				Protocol: "vless", Address: "example.com", Port: 443, UUID: "abc",
				Security: "tls", Network: "kcp",
			},
			want: "not supported",
		},
		{
			name: "reality without public key",
			profile: Profile{
				Protocol: "vless", Address: "example.com", Port: 443, UUID: "abc",
				Security: "reality", SNI: "example.com", Network: "tcp",
			},
			want: "public key",
		},
		{
			name: "reality over ws",
			profile: Profile{
				Protocol: "vless", Address: "example.com", Port: 443, UUID: "abc",
				Security: "reality", SNI: "example.com", PublicKey: "abc", Network: "ws",
			},
			want: "WebSocket",
		},
		{
			name: "flow on websocket",
			profile: Profile{
				Protocol: "vless", Address: "example.com", Port: 443, UUID: "abc",
				Security: "tls", SNI: "example.com", Flow: "xtls-rprx-vision", Network: "ws",
			},
			want: "TCP",
		},
		{
			name: "unsupported shadowsocks method",
			profile: Profile{
				Protocol: "ss", Address: "example.com", Port: 8388, Password: "x",
				Cipher: "rc4-md5", Security: "none", Network: "tcp",
			},
			want: "not supported",
		},
		{
			name: "bad port",
			profile: Profile{
				Protocol: "trojan", Address: "example.com", Port: 70000, Password: "x",
			},
			want: "port",
		},
		{
			name: "bad hostname",
			profile: Profile{
				Protocol: "trojan", Address: "not a host", Port: 443, Password: "x",
			},
			want: "address",
		},
	}

	for _, testCase := range cases {
		t.Run(testCase.name, func(t *testing.T) {
			_, err := BuildXrayConfig(testCase.profile, 18080, testErrorLog)
			if err == nil {
				t.Fatalf("expected an error")
			}
			if !strings.Contains(strings.ToLower(err.Error()), strings.ToLower(testCase.want)) {
				t.Fatalf("error %q does not mention %q", err, testCase.want)
			}
		})
	}
}

func TestIPv6AddressIsAccepted(t *testing.T) {
	config := decodeConfig(t, Profile{
		Protocol: "trojan",
		Address:  "2001:db8::1",
		Port:     443,
		Password: "secret",
		Security: "tls",
		SNI:      "example.com",
		Network:  "tcp",
	})
	servers := outboundSettings(t, config)["settings"].(map[string]any)["servers"].([]any)
	if servers[0].(map[string]any)["address"] != "2001:db8::1" {
		t.Fatalf("IPv6 address was not preserved")
	}
}
