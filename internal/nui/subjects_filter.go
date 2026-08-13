package nui

import (
	"errors"
	"strings"
	"unicode"
)

var (
	errFilterRequired = errors.New("type a name to listen, like orders.>")
	errFilterTooBroad = errors.New("listening to every name at once is too broad")
	errFilterInvalid  = errors.New("that is not a valid name")
)

const (
	kindStream   = "stream"
	kindKV       = "kv"
	kindObject   = "object"
	kindPattern  = "pattern"
	kindOccupied = "occupied"
)

func validateListenFilter(filter string) error {
	filter = strings.TrimSpace(filter)
	if filter == "" {
		return errFilterRequired
	}
	for _, r := range filter {
		if unicode.IsSpace(r) {
			return errFilterInvalid
		}
	}
	tokens := strings.Split(filter, ".")
	literal := 0
	for i, tok := range tokens {
		if tok == "" {
			return errFilterInvalid
		}
		if tok == ">" {
			if i != len(tokens)-1 {
				return errFilterInvalid
			}
			continue
		}
		if tok == "*" {
			continue
		}
		if strings.ContainsAny(tok, "*>") {
			return errFilterInvalid
		}
		literal++
	}
	if literal == 0 {
		return errFilterTooBroad
	}
	return nil
}

func isInternalSubject(subject string) bool {
	return strings.HasPrefix(subject, "$SYS") ||
		strings.HasPrefix(subject, "$JS.") ||
		strings.HasPrefix(subject, "_INBOX")
}

func streamKind(name string, subjects []string) string {
	if strings.HasPrefix(name, "KV_") {
		return kindKV
	}
	if strings.HasPrefix(name, "OBJ_") {
		return kindObject
	}
	for _, s := range subjects {
		if strings.HasPrefix(s, "$KV.") {
			return kindKV
		}
		if strings.HasPrefix(s, "$O.") {
			return kindObject
		}
	}
	return kindStream
}

func collapsePattern(subject, kind string) (path, outKind string) {
	parts := strings.Split(subject, ".")
	switch kind {
	case kindKV:
		if len(parts) >= 2 && parts[0] == "$KV" {
			return "$KV." + parts[1], kindKV
		}
	case kindObject:
		if len(parts) >= 2 && parts[0] == "$O" {
			return "$O." + parts[1], kindObject
		}
	}
	path = strings.TrimSuffix(subject, ".>")
	if path == "" {
		path = subject
	}
	return path, kindPattern
}

func capAppend[T any](dst []T, item T, max int) ([]T, bool) {
	if max > 0 && len(dst) >= max {
		return dst, true
	}
	return append(dst, item), false
}
