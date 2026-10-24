package main

import (
	"encoding/json"
	"fmt"
	"net"
	"path/filepath"
	"regexp"
	"strings"
)

type Profile struct {
	ID            string `json:"id"`
	Name          string `json:"name"`
	Protocol      string `json:"protocol"`
	Address       string `json:"address"`
	Port          int    `json:"port"`
	UUID          string `json:"uuid,omitempty"`
	Password      string `json:"password,omitempty"`
	Flow          string `json:"flow,omitempty"`
	Encryption    string `json:"encryption,omitempty"`
	AlterID       int    `json:"alterId,omitempty"`
	Cipher        string `json:"cipher,omitempty"`
	Security      string `json:"security,omitempty"`
	SNI           string `json:"sni,omitempty"`
	ALPN          string `json:"alpn,omitempty"`
	Fingerprint   string `json:"fingerprint,omitempty"`
	AllowInsecure bool   `json:"allowInsecure,omitempty"`
	PublicKey     string `json:"publicKey,omitempty"`
	ShortID       string `json:"shortId,omitempty"`
	SpiderX       string `json:"spiderX,omitempty"`
	Network       string `json:"network,omitempty"`
	Path          string `json:"path,omitempty"`
	Host          string `json:"host,omitempty"`
	ServiceName   string `json:"serviceName,omitempty"`
}

var (
	domainPattern = regexp.MustCompile(`^[A-Za-z0-9](?:[A-Za-z0-9._-]{0,251}[A-Za-z0-9])?$`)
	hexPattern    = regexp.MustCompile(`^[0-9a-fA-F]*$`)
)

var supportedSSMethods = map[string]bool{
	"aes-128-gcm":                   true,
	"aes-256-gcm":                   true,
	"chacha20-poly1305":             true,
	"chacha20-ietf-poly1305":        true,
	"xchacha20-poly1305":            true,
	"xchacha20-ietf-poly1305":       true,
	"2022-blake3-aes-128-gcm":       true,
	"2022-blake3-aes-256-gcm":       true,
	"2022-blake3-chacha20-poly1305": true,
	"none":                          true,
	"plain":                         true,
}

var supportedVMessCiphers = map[string]bool{
	"auto":               true,
	"aes-128-gcm":        true,
	"chacha20-poly1305":  true,
	"none":               true,
	"zero":               true,
}

var supportedFingerprints = map[string]bool{
	"chrome":     true,
	"firefox":    true,
	"safari":     true,
	"ios":        true,
	"android":    true,
	"edge":       true,
	"360":        true,
	"qq":         true,
	"random":     true,
	"randomized": true,
}

func BuildXrayConfig(profile Profile, port int, errorLogPath string) ([]byte, error) {
	if port < 1 || port > 65535 {
		return nil, fmt.Errorf("invalid local proxy port %d", port)
	}

	normalized, err := normalizeProfile(profile)
	if err != nil {
		return nil, err
	}

	outbound, err := buildOutbound(normalized)
	if err != nil {
		return nil, err
	}

	config := map[string]any{
		"log": map[string]any{
			"loglevel": "warning",
			"access":   "none",
			"error":    filepath.ToSlash(errorLogPath),
		},
		"inbounds": []any{
			map[string]any{
				"tag":      "http-in",
				"listen":   "127.0.0.1",
				"port":     port,
				"protocol": "http",
				"settings": map[string]any{
					"allowTransparent": false,
					"userLevel":        0,
				},
			},
		},
		"outbounds": []any{outbound},
	}

	return json.MarshalIndent(config, "", "  ")
}

func normalizeProfile(profile Profile) (Profile, error) {
	profile.Protocol = strings.ToLower(strings.TrimSpace(profile.Protocol))
	profile.Address = strings.TrimSpace(profile.Address)
	profile.Security = strings.ToLower(strings.TrimSpace(profile.Security))
	profile.Network = strings.ToLower(strings.TrimSpace(profile.Network))
	profile.Flow = strings.TrimSpace(profile.Flow)
	profile.Cipher = strings.ToLower(strings.TrimSpace(profile.Cipher))
	profile.Encryption = strings.ToLower(strings.TrimSpace(profile.Encryption))
	profile.SNI = strings.TrimSpace(profile.SNI)
	profile.Host = strings.TrimSpace(profile.Host)
	profile.ServiceName = strings.TrimSpace(profile.ServiceName)
	profile.Path = strings.TrimSpace(profile.Path)
	profile.PublicKey = strings.TrimSpace(profile.PublicKey)
	profile.ShortID = strings.TrimSpace(profile.ShortID)
	profile.SpiderX = strings.TrimSpace(profile.SpiderX)
	profile.ALPN = strings.TrimSpace(profile.ALPN)
	profile.Fingerprint = strings.ToLower(strings.TrimSpace(profile.Fingerprint))

	if profile.Network == "" {
		profile.Network = "tcp"
	}
	if profile.Network == "splithttp" {
		profile.Network = "xhttp"
	}
	if profile.Network == "raw" {
		profile.Network = "tcp"
	}
	if profile.Security == "" {
		profile.Security = "none"
	}

	if profile.Address == "" {
		return profile, fmt.Errorf("the server address is missing")
	}
	if err := validateHost(profile.Address); err != nil {
		return profile, err
	}
	if profile.Port < 1 || profile.Port > 65535 {
		return profile, fmt.Errorf("the server port is invalid")
	}
	if !oneOf(profile.Network, "tcp", "ws", "grpc", "httpupgrade", "xhttp") {
		return profile, fmt.Errorf("transport %q is not supported", profile.Network)
	}
	if !oneOf(profile.Security, "none", "tls", "reality") {
		return profile, fmt.Errorf("security %q is not supported", profile.Security)
	}
	if profile.SNI != "" {
		if err := validateHostHeader(profile.SNI, false); err != nil {
			return profile, fmt.Errorf("invalid SNI: %w", err)
		}
	}
	if profile.Fingerprint != "" && !supportedFingerprints[profile.Fingerprint] {
		return profile, fmt.Errorf("TLS fingerprint %q is not supported", profile.Fingerprint)
	}
	if _, err := splitALPN(profile.ALPN); err != nil {
		return profile, err
	}

	switch profile.Protocol {
	case "vless":
		if err := validateSecret("UUID", profile.UUID); err != nil {
			return profile, err
		}
		if profile.Encryption != "" && profile.Encryption != "none" && profile.Encryption != "zero" {
			return profile, fmt.Errorf("VLESS encryption must be \"none\"")
		}
		if profile.Flow != "" {
			if profile.Flow != "xtls-rprx-vision" {
				return profile, fmt.Errorf("flow %q is not supported; use xtls-rprx-vision", profile.Flow)
			}
			if profile.Network != "tcp" {
				return profile, fmt.Errorf("XTLS flow requires the TCP transport")
			}
			if profile.Security == "none" {
				return profile, fmt.Errorf("XTLS flow requires TLS or REALITY")
			}
		}
	case "vmess":
		if err := validateSecret("UUID", profile.UUID); err != nil {
			return profile, err
		}
		if profile.Cipher == "" {
			profile.Cipher = "auto"
		}
		if !supportedVMessCiphers[profile.Cipher] {
			return profile, fmt.Errorf("VMess cipher %q is not supported", profile.Cipher)
		}
		if profile.AlterID < 0 || profile.AlterID > 65535 {
			return profile, fmt.Errorf("invalid VMess alterId")
		}
	case "trojan":
		if err := validateSecret("password", profile.Password); err != nil {
			return profile, err
		}
	case "ss":
		if err := validateSecret("password", profile.Password); err != nil {
			return profile, err
		}
		if profile.Cipher == "" {
			return profile, fmt.Errorf("the Shadowsocks method is missing")
		}
		if !supportedSSMethods[profile.Cipher] {
			return profile, fmt.Errorf("Shadowsocks method %q is not supported", profile.Cipher)
		}
		if profile.Security != "none" {
			return profile, fmt.Errorf("Shadowsocks does not support an additional TLS layer in this build")
		}
		if profile.Network != "tcp" {
			return profile, fmt.Errorf("Shadowsocks transports are not supported in this build")
		}
	default:
		return profile, fmt.Errorf("protocol %q is not supported", profile.Protocol)
	}

	if profile.Security == "reality" {
		if profile.Protocol == "ss" {
			return profile, fmt.Errorf("REALITY is not available for Shadowsocks")
		}
		if profile.PublicKey == "" {
			return profile, fmt.Errorf("REALITY requires a public key")
		}
		if profile.SNI == "" {
			return profile, fmt.Errorf("REALITY requires an SNI/server name")
		}
		if profile.Network == "ws" {
			return profile, fmt.Errorf("REALITY cannot be combined with WebSocket")
		}
		if len(profile.ShortID) > 16 || !hexPattern.MatchString(profile.ShortID) {
			return profile, fmt.Errorf("REALITY shortId must be up to 16 hexadecimal characters")
		}
		if profile.Fingerprint == "" {
			profile.Fingerprint = "chrome"
		}
		if profile.SpiderX == "" {
			profile.SpiderX = "/"
		}
	}

	if profile.Network == "ws" || profile.Network == "xhttp" || profile.Network == "httpupgrade" {
		if profile.Path == "" {
			profile.Path = "/"
		}
		if !strings.HasPrefix(profile.Path, "/") {
			profile.Path = "/" + profile.Path
		}
	}
	if profile.Host != "" {
		if err := validateHostHeader(profile.Host, true); err != nil {
			return profile, fmt.Errorf("invalid host header: %w", err)
		}
	}
	if profile.ServiceName != "" {
		if strings.ContainsAny(profile.ServiceName, " \t\r\n/\\") {
			return profile, fmt.Errorf("invalid gRPC service name")
		}
	}

	return profile, nil
}

func buildOutbound(profile Profile) (map[string]any, error) {
	outboundProtocol := profile.Protocol
	if outboundProtocol == "ss" {
		outboundProtocol = "shadowsocks"
	}
	outbound := map[string]any{
		"tag":      "proxy",
		"protocol": outboundProtocol,
	}

	switch profile.Protocol {
	case "vless":
		user := map[string]any{
			"id":         profile.UUID,
			"encryption": "none",
		}
		if profile.Flow != "" {
			user["flow"] = profile.Flow
		}
		outbound["settings"] = map[string]any{
			"vnext": []any{
				map[string]any{
					"address": profile.Address,
					"port":    profile.Port,
					"users":   []any{user},
				},
			},
		}
	case "vmess":
		security := profile.Cipher
		if security == "" {
			security = "auto"
		}
		outbound["settings"] = map[string]any{
			"vnext": []any{
				map[string]any{
					"address": profile.Address,
					"port":    profile.Port,
					"users": []any{
						map[string]any{
							"id":       profile.UUID,
							"alterId":  profile.AlterID,
							"security": security,
						},
					},
				},
			},
		}
	case "trojan":
		outbound["settings"] = map[string]any{
			"servers": []any{
				map[string]any{
					"address":  profile.Address,
					"port":     profile.Port,
					"password": profile.Password,
				},
			},
		}
	case "ss":
		outbound["settings"] = map[string]any{
			"servers": []any{
				map[string]any{
					"address":  profile.Address,
					"port":     profile.Port,
					"method":   profile.Cipher,
					"password": profile.Password,
				},
			},
		}
	default:
		return nil, fmt.Errorf("protocol %q is not supported", profile.Protocol)
	}

	if profile.Protocol != "ss" {
		outbound["streamSettings"] = buildStreamSettings(profile)
	}
	return outbound, nil
}

func buildStreamSettings(profile Profile) map[string]any {
	stream := map[string]any{
		"network": profile.Network,
	}

	switch profile.Security {
	case "tls":
		tlsSettings := map[string]any{
			"allowInsecure": profile.AllowInsecure,
		}
		if profile.SNI != "" {
			tlsSettings["serverName"] = profile.SNI
		}
		if profile.Fingerprint != "" {
			tlsSettings["fingerprint"] = profile.Fingerprint
		}
		if alpn, _ := splitALPN(profile.ALPN); len(alpn) > 0 {
			tlsSettings["alpn"] = alpn
		}
		stream["security"] = "tls"
		stream["tlsSettings"] = tlsSettings
	case "reality":
		realitySettings := map[string]any{
			"serverName":  profile.SNI,
			"fingerprint": profile.Fingerprint,
			"publicKey":   profile.PublicKey,
			"shortId":     profile.ShortID,
			"spiderX":     profile.SpiderX,
		}
		stream["security"] = "reality"
		stream["realitySettings"] = realitySettings
	default:
		stream["security"] = "none"
	}

	switch profile.Network {
	case "ws":
		wsSettings := map[string]any{
			"path": profile.Path,
		}
		if profile.Host != "" {
			wsSettings["headers"] = map[string]any{"Host": profile.Host}
		}
		stream["wsSettings"] = wsSettings
	case "grpc":
		grpcSettings := map[string]any{
			"serviceName": profile.ServiceName,
		}
		if profile.Host != "" {
			grpcSettings["authority"] = profile.Host
		}
		stream["grpcSettings"] = grpcSettings
	case "httpupgrade":
		upgradeSettings := map[string]any{
			"path": profile.Path,
		}
		if profile.Host != "" {
			upgradeSettings["host"] = profile.Host
		}
		stream["httpupgradeSettings"] = upgradeSettings
	case "xhttp":
		xhttpSettings := map[string]any{
			"path": profile.Path,
			"mode": "auto",
		}
		if profile.Host != "" {
			xhttpSettings["host"] = profile.Host
		}
		stream["xhttpSettings"] = xhttpSettings
	}

	return stream
}

func validateHost(value string) error {
	host := strings.TrimPrefix(strings.TrimSuffix(value, "]"), "[")
	if host == "" {
		return fmt.Errorf("the server address is missing")
	}
	if strings.ContainsAny(value, " \t\r\n/\\@") {
		return fmt.Errorf("the server address contains invalid characters")
	}
	if net.ParseIP(host) != nil {
		return nil
	}
	if !domainPattern.MatchString(host) {
		return fmt.Errorf("the server address is not a valid hostname or IP address")
	}
	return nil
}

func validateHostHeader(value string, allowPort bool) error {
	if strings.ContainsAny(value, " \t\r\n/\\") {
		return fmt.Errorf("it contains invalid characters")
	}
	if !allowPort {
		return validateHost(value)
	}
	host := value
	if strings.HasPrefix(value, "[") {
		end := strings.Index(value, "]")
		if end < 0 {
			return fmt.Errorf("it has an invalid IPv6 literal")
		}
		host = value[1:end]
	} else if separator := strings.LastIndex(value, ":"); separator > 0 {
		host = value[:separator]
	}
	host = strings.TrimPrefix(strings.TrimSuffix(host, "]"), "[")
	if net.ParseIP(host) != nil {
		return nil
	}
	if !domainPattern.MatchString(host) {
		return fmt.Errorf("it is not a valid hostname or IP address")
	}
	return nil
}

func validateSecret(label, value string) error {
	if value == "" {
		return fmt.Errorf("%s is missing", label)
	}
	for _, char := range value {
		if char < 0x20 || char == 0x7f {
			return fmt.Errorf("%s contains a control character", label)
		}
	}
	if len(value) > 512 {
		return fmt.Errorf("%s is too long", label)
	}
	return nil
}

func splitALPN(value string) ([]string, error) {
	if value == "" {
		return nil, nil
	}
	parts := strings.Split(value, ",")
	result := make([]string, 0, len(parts))
	for _, part := range parts {
		trimmed := strings.TrimSpace(part)
		if trimmed == "" {
			continue
		}
		if strings.ContainsAny(trimmed, " \t\r\n") {
			return nil, fmt.Errorf("invalid ALPN value %q", trimmed)
		}
		result = append(result, trimmed)
	}
	if len(result) > 8 {
		return nil, fmt.Errorf("too many ALPN values")
	}
	return result, nil
}

func oneOf(value string, allowed ...string) bool {
	for _, candidate := range allowed {
		if value == candidate {
			return true
		}
	}
	return false
}
