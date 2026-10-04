package main

import (
	"encoding/json"
	"errors"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"
)

const (
	maxBodyBytes = 4 << 20 // 4 MiB
	cookieName   = "pv_session"
)

type ctxKey string

func (a *App) Routes() http.Handler {
	mux := http.NewServeMux()

	mux.HandleFunc("GET /api/health", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, map[string]any{"ok": true, "app": "PassVault", "time": nowUnix()})
	})
	mux.HandleFunc("GET /api/status", a.handleStatus)
	mux.HandleFunc("POST /api/setup", a.handleSetup)
	mux.HandleFunc("POST /api/unlock", a.handleUnlock)
	mux.HandleFunc("POST /api/lock", a.requireAuth(a.handleLock))

	mux.HandleFunc("POST /api/master", a.requireAuth(a.handleChangeMaster))
	mux.HandleFunc("GET /api/data", a.requireAuth(a.handleGetData))
	mux.HandleFunc("GET /api/export", a.requireAuth(a.handleExport))
	mux.HandleFunc("POST /api/import", a.requireAuth(a.handleImport))

	mux.HandleFunc("POST /api/platforms", a.requireAuth(a.handleCreatePlatform))
	mux.HandleFunc("PUT /api/platforms/{id}", a.requireAuth(a.handleUpdatePlatform))
	mux.HandleFunc("DELETE /api/platforms/{id}", a.requireAuth(a.handleDeletePlatform))

	mux.HandleFunc("POST /api/accounts", a.requireAuth(a.handleCreateAccount))
	mux.HandleFunc("PUT /api/accounts/{id}", a.requireAuth(a.handleUpdateAccount))
	mux.HandleFunc("DELETE /api/accounts/{id}", a.requireAuth(a.handleDeleteAccount))

	mux.Handle("/", a.staticHandler())

	return securityHeaders(mux)
}

// ---- auth ----

func (a *App) tokenFrom(r *http.Request) string {
	if c, err := r.Cookie(cookieName); err == nil && c.Value != "" {
		return c.Value
	}
	h := r.Header.Get("Authorization")
	if strings.HasPrefix(h, "Bearer ") {
		return strings.TrimSpace(strings.TrimPrefix(h, "Bearer "))
	}
	return ""
}

func (a *App) requireAuth(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tok := a.tokenFrom(r)
		if !a.validSession(tok) {
			writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
			return
		}
		next(w, r)
	}
}

func (a *App) setSessionCookie(w http.ResponseWriter, token string, maxAge int) {
	http.SetCookie(w, &http.Cookie{
		Name:     cookieName,
		Value:    token,
		Path:     "/",
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
		MaxAge:   maxAge,
	})
}

// ---- status / setup / unlock ----

func (a *App) handleStatus(w http.ResponseWriter, r *http.Request) {
	tok := a.tokenFrom(r)
	a.mu.Lock()
	initialized := a.file != nil
	unlocked := a.vault != nil && a.validSessionLocked(tok)
	a.mu.Unlock()
	writeJSON(w, http.StatusOK, map[string]any{
		"initialized": initialized,
		"unlocked":    unlocked,
		"version":     vaultVersion,
	})
}

func (a *App) handleSetup(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Master string `json:"master"`
	}
	if !decodeBody(w, r, &body) {
		return
	}
	if len(strings.TrimSpace(body.Master)) < 6 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "主密码至少需要 6 个字符"})
		return
	}
	if err := a.setup(body.Master); err != nil {
		if errors.Is(err, errAlreadyInit) {
			writeJSON(w, http.StatusConflict, map[string]string{"error": "密码库已存在"})
			return
		}
		serverError(w, err)
		return
	}
	tok := a.createSession()
	a.setSessionCookie(w, tok, int(sessionTTL.Seconds()))
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "token": tok})
}

func (a *App) handleUnlock(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Master string `json:"master"`
	}
	if !decodeBody(w, r, &body) {
		return
	}
	if err := a.unlock(body.Master); err != nil {
		if errors.Is(err, errBadPassword) {
			writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "主密码错误"})
			return
		}
		if errors.Is(err, errNotInitialized) {
			writeJSON(w, http.StatusConflict, map[string]string{"error": "密码库尚未初始化"})
			return
		}
		serverError(w, err)
		return
	}
	tok := a.createSession()
	a.setSessionCookie(w, tok, int(sessionTTL.Seconds()))
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "token": tok})
}

func (a *App) handleLock(w http.ResponseWriter, r *http.Request) {
	a.dropSession(a.tokenFrom(r))
	a.setSessionCookie(w, "", -1)
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

func (a *App) handleChangeMaster(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Old string `json:"old"`
		New string `json:"new"`
	}
	if !decodeBody(w, r, &body) {
		return
	}
	if len(strings.TrimSpace(body.New)) < 6 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "新主密码至少需要 6 个字符"})
		return
	}
	if err := a.changeMaster(body.Old, body.New); err != nil {
		if errors.Is(err, errBadPassword) {
			writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "当前主密码错误"})
			return
		}
		serverError(w, err)
		return
	}
	// invalidate all sessions, then issue a fresh one
	a.mu.Lock()
	a.clearSessionsLocked()
	a.mu.Unlock()
	tok := a.createSession()
	a.setSessionCookie(w, tok, int(sessionTTL.Seconds()))
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "token": tok})
}

// ---- data ----

func (a *App) handleGetData(w http.ResponseWriter, r *http.Request) {
	a.mu.Lock()
	if a.vault == nil {
		a.mu.Unlock()
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "locked"})
		return
	}
	v := a.snapshotLocked()
	a.mu.Unlock()
	sortVault(v)
	writeJSON(w, http.StatusOK, v)
}

func (a *App) handleExport(w http.ResponseWriter, r *http.Request) {
	a.mu.Lock()
	if a.vault == nil {
		a.mu.Unlock()
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "locked"})
		return
	}
	v := a.snapshotLocked()
	a.mu.Unlock()
	sortVault(v)
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Content-Disposition", `attachment; filename="passvault-export.json"`)
	enc := json.NewEncoder(w)
	enc.SetIndent("", "  ")
	_ = enc.Encode(v)
}

func (a *App) handleImport(w http.ResponseWriter, r *http.Request) {
	var v Vault
	if !decodeBody(w, r, &v) {
		return
	}
	v.normalize()
	a.mu.Lock()
	if a.vault == nil {
		a.mu.Unlock()
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "locked"})
		return
	}
	a.vault = &v
	err := a.saveLocked()
	a.mu.Unlock()
	if err != nil {
		serverError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

// ---- platforms ----

func (a *App) handleCreatePlatform(w http.ResponseWriter, r *http.Request) {
	var body Platform
	if !decodeBody(w, r, &body) {
		return
	}
	body.Name = strings.TrimSpace(body.Name)
	if body.Name == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "平台名称不能为空"})
		return
	}
	a.mu.Lock()
	if a.vault == nil {
		a.mu.Unlock()
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "locked"})
		return
	}
	body.ID = newID()
	body.CreatedAt = nowUnix()
	body.UpdatedAt = body.CreatedAt
	normalizeFields(body.FieldTemplate)
	a.vault.Platforms = append(a.vault.Platforms, body)
	err := a.saveLocked()
	a.mu.Unlock()
	if err != nil {
		serverError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, body)
}

func (a *App) handleUpdatePlatform(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	var body Platform
	if !decodeBody(w, r, &body) {
		return
	}
	a.mu.Lock()
	if a.vault == nil {
		a.mu.Unlock()
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "locked"})
		return
	}
	idx := findPlatform(a.vault, id)
	if idx < 0 {
		a.mu.Unlock()
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "平台不存在"})
		return
	}
	cur := a.vault.Platforms[idx]
	if s := strings.TrimSpace(body.Name); s != "" {
		cur.Name = s
	}
	cur.Color = body.Color
	if body.FieldTemplate != nil {
		normalizeFields(body.FieldTemplate)
		cur.FieldTemplate = body.FieldTemplate
	}
	cur.UpdatedAt = nowUnix()
	a.vault.Platforms[idx] = cur
	err := a.saveLocked()
	a.mu.Unlock()
	if err != nil {
		serverError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, cur)
}

func (a *App) handleDeletePlatform(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	a.mu.Lock()
	if a.vault == nil {
		a.mu.Unlock()
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "locked"})
		return
	}
	idx := findPlatform(a.vault, id)
	if idx < 0 {
		a.mu.Unlock()
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "平台不存在"})
		return
	}
	a.vault.Platforms = append(a.vault.Platforms[:idx], a.vault.Platforms[idx+1:]...)
	kept := a.vault.Accounts[:0]
	for _, acc := range a.vault.Accounts {
		if acc.PlatformID != id {
			kept = append(kept, acc)
		}
	}
	a.vault.Accounts = kept
	err := a.saveLocked()
	a.mu.Unlock()
	if err != nil {
		serverError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

// ---- accounts ----

func (a *App) handleCreateAccount(w http.ResponseWriter, r *http.Request) {
	var body Account
	if !decodeBody(w, r, &body) {
		return
	}
	a.mu.Lock()
	if a.vault == nil {
		a.mu.Unlock()
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "locked"})
		return
	}
	if body.PlatformID == "" || findPlatform(a.vault, body.PlatformID) < 0 {
		a.mu.Unlock()
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "请选择有效的平台"})
		return
	}
	body.ID = newID()
	body.CreatedAt = nowUnix()
	body.UpdatedAt = body.CreatedAt
	normalizeFields(body.Fields)
	a.vault.Accounts = append(a.vault.Accounts, body)
	err := a.saveLocked()
	a.mu.Unlock()
	if err != nil {
		serverError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, body)
}

func (a *App) handleUpdateAccount(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	var body Account
	if !decodeBody(w, r, &body) {
		return
	}
	a.mu.Lock()
	if a.vault == nil {
		a.mu.Unlock()
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "locked"})
		return
	}
	idx := findAccount(a.vault, id)
	if idx < 0 {
		a.mu.Unlock()
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "账号不存在"})
		return
	}
	if body.PlatformID == "" || findPlatform(a.vault, body.PlatformID) < 0 {
		a.mu.Unlock()
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "请选择有效的平台"})
		return
	}
	cur := a.vault.Accounts[idx]
	cur.PlatformID = body.PlatformID
	cur.Title = body.Title
	cur.Username = body.Username
	cur.Password = body.Password
	cur.URL = body.URL
	cur.Notes = body.Notes
	cur.Favorite = body.Favorite
	if body.Fields != nil {
		normalizeFields(body.Fields)
		cur.Fields = body.Fields
	}
	cur.UpdatedAt = nowUnix()
	a.vault.Accounts[idx] = cur
	err := a.saveLocked()
	a.mu.Unlock()
	if err != nil {
		serverError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, cur)
}

func (a *App) handleDeleteAccount(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	a.mu.Lock()
	if a.vault == nil {
		a.mu.Unlock()
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "locked"})
		return
	}
	idx := findAccount(a.vault, id)
	if idx < 0 {
		a.mu.Unlock()
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "账号不存在"})
		return
	}
	a.vault.Accounts = append(a.vault.Accounts[:idx], a.vault.Accounts[idx+1:]...)
	err := a.saveLocked()
	a.mu.Unlock()
	if err != nil {
		serverError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

// ---- static files (SPA) ----

func (a *App) staticHandler() http.Handler {
	dir := a.webDir
	if dir == "" {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			http.NotFound(w, r)
		})
	}
	fileServer := http.FileServer(http.Dir(dir))
	indexPath := filepath.Join(dir, "index.html")
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.HasPrefix(r.URL.Path, "/api/") {
			http.NotFound(w, r)
			return
		}
		clean := filepath.Clean(r.URL.Path)
		target := filepath.Join(dir, clean)
		if info, err := os.Stat(target); err == nil && !info.IsDir() {
			fileServer.ServeHTTP(w, r)
			return
		}
		// SPA fallback
		if _, err := os.Stat(indexPath); err == nil {
			http.ServeFile(w, r, indexPath)
			return
		}
		http.NotFound(w, r)
	})
}

// ---- helpers ----

func normalizeFields(fields []Field) {
	for i := range fields {
		ensureFieldDefaults(&fields[i])
	}
}

func decodeBody(w http.ResponseWriter, r *http.Request, dst any) bool {
	r.Body = http.MaxBytesReader(w, r.Body, maxBodyBytes)
	dec := json.NewDecoder(r.Body)
	dec.DisallowUnknownFields()
	if err := dec.Decode(dst); err != nil {
		if errors.Is(err, io.EOF) {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "请求体为空"})
			return false
		}
		var maxErr *http.MaxBytesError
		if errors.As(err, &maxErr) {
			writeJSON(w, http.StatusRequestEntityTooLarge, map[string]string{"error": "请求体过大"})
			return false
		}
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "请求格式错误: " + err.Error()})
		return false
	}
	return true
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func serverError(w http.ResponseWriter, err error) {
	log.Printf("server error: %v", err)
	writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "服务器内部错误"})
}

func securityHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("Referrer-Policy", "no-referrer")
		next.ServeHTTP(w, r)
	})
}
