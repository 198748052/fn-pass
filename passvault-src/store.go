package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"sync"
	"time"
)

const (
	sessionTTL       = 30 * time.Minute
	sessionReapEvery = 5 * time.Minute
)

// App holds the unlocked vault, the on-disk state and active sessions.
type App struct {
	mu       sync.Mutex
	filePath string
	webDir   string

	file  *vaultFile // nil until initialized
	vault *Vault     // non-nil while unlocked
	key   []byte     // AES key for the current vault

	sessions map[string]time.Time

	startedAt int64
}

func NewApp(dataDir, webDir string) (*App, error) {
	app := &App{
		filePath:  filepath.Join(dataDir, "vault.json"),
		webDir:    webDir,
		sessions:  map[string]time.Time{},
		startedAt: nowUnix(),
	}
	if err := app.loadFile(); err != nil {
		return nil, err
	}
	go app.reapLoop()
	return app, nil
}

func (a *App) loadFile() error {
	raw, err := os.ReadFile(a.filePath)
	if err != nil {
		if os.IsNotExist(err) {
			a.file = nil
			return nil
		}
		return err
	}
	var f vaultFile
	if err := json.Unmarshal(raw, &f); err != nil {
		return err
	}
	a.file = &f
	return nil
}

// saveLocked persists the vault. Caller must hold a.mu and have an unlocked key.
func (a *App) saveLocked() error {
	if a.vault == nil || a.key == nil || a.file == nil {
		return errLocked
	}
	salt, err := unb64(a.file.Salt)
	if err != nil {
		return err
	}
	sealed, err := sealVault(a.vault, a.key, salt, a.file.Iterations)
	if err != nil {
		return err
	}
	sealed.Salt = a.file.Salt
	raw, err := json.MarshalIndent(sealed, "", "  ")
	if err != nil {
		return err
	}
	tmp := a.filePath + ".tmp"
	if err := os.WriteFile(tmp, raw, 0o600); err != nil {
		return err
	}
	if err := os.Rename(tmp, a.filePath); err != nil {
		return err
	}
	a.file = sealed
	return nil
}

func (a *App) initialized() bool {
	return a.file != nil
}

func (a *App) setup(master string) error {
	a.mu.Lock()
	defer a.mu.Unlock()
	if a.file != nil {
		return errAlreadyInit
	}
	v := newVault()
	f, err := encryptVault(v, master)
	if err != nil {
		return err
	}
	key, err := deriveKey(master, mustB64(f.Salt), f.Iterations)
	if err != nil {
		return err
	}
	a.vault = v
	a.key = key
	a.file = f
	return a.saveLocked()
}

func (a *App) unlock(master string) error {
	a.mu.Lock()
	defer a.mu.Unlock()
	if a.file == nil {
		return errNotInitialized
	}
	v, key, err := decryptVault(a.file, master)
	if err != nil {
		return err
	}
	a.vault = v
	a.key = key
	return nil
}

func (a *App) changeMaster(oldPw, newPw string) error {
	a.mu.Lock()
	defer a.mu.Unlock()
	if a.file == nil {
		return errNotInitialized
	}
	if _, _, err := decryptVault(a.file, oldPw); err != nil {
		return err
	}
	f, err := encryptVault(a.vault, newPw)
	if err != nil {
		return err
	}
	key, err := deriveKey(newPw, mustB64(f.Salt), f.Iterations)
	if err != nil {
		return err
	}
	a.file = f
	a.key = key
	return a.saveLocked()
}

func (a *App) lock() {
	a.mu.Lock()
	defer a.mu.Unlock()
	a.vault = nil
	a.key = nil
	a.sessions = map[string]time.Time{}
}

// snapshotLocked returns a deep copy of the vault for read access.
func (a *App) snapshotLocked() *Vault {
	b, _ := json.Marshal(a.vault)
	var cp Vault
	_ = json.Unmarshal(b, &cp)
	return &cp
}

func (a *App) createSession() string {
	token := newID() + newID()
	a.mu.Lock()
	a.sessions[token] = time.Now().Add(sessionTTL)
	a.mu.Unlock()
	return token
}

func (a *App) validSession(token string) bool {
	if token == "" {
		return false
	}
	a.mu.Lock()
	defer a.mu.Unlock()
	return a.validSessionLocked(token)
}

// validSessionLocked assumes a.mu is already held.
func (a *App) validSessionLocked(token string) bool {
	if token == "" {
		return false
	}
	exp, ok := a.sessions[token]
	if !ok {
		return false
	}
	if time.Now().After(exp) {
		delete(a.sessions, token)
		return false
	}
	a.sessions[token] = time.Now().Add(sessionTTL)
	return true
}

func (a *App) dropSession(token string) {
	a.mu.Lock()
	delete(a.sessions, token)
	a.mu.Unlock()
}

func (a *App) clearSessionsLocked() {
	a.sessions = map[string]time.Time{}
}

func (a *App) reapLoop() {
	t := time.NewTicker(sessionReapEvery)
	defer t.Stop()
	for range t.C {
		now := time.Now()
		a.mu.Lock()
		for tok, exp := range a.sessions {
			if now.After(exp) {
				delete(a.sessions, tok)
			}
		}
		a.mu.Unlock()
	}
}

func mustB64(s string) []byte {
	b, err := unb64(s)
	if err != nil {
		panic(err)
	}
	return b
}
