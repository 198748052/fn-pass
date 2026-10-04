package main

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/pbkdf2"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"sort"
	"strings"
	"time"
)

const (
	vaultVersion  = 1
	vaultKDF      = "pbkdf2-sha256"
	kdfIterations = 210000
	keyLength     = 32
)

var (
	errNotInitialized = errors.New("vault not initialized")
	errAlreadyInit    = errors.New("vault already initialized")
	errBadPassword    = errors.New("invalid master password")
	errLocked         = errors.New("vault is locked")
)

// Field is a custom key/value entry attached to an account or used as a
// platform level template.
type Field struct {
	ID    string `json:"id"`
	Key   string `json:"key"`
	Value string `json:"value"`
	Type  string `json:"type"`
}

// Platform groups accounts. Users can create their own platforms and define a
// reusable set of extra fields for new accounts.
type Platform struct {
	ID            string  `json:"id"`
	Name          string  `json:"name"`
	Color         string  `json:"color"`
	FieldTemplate []Field `json:"fieldTemplate,omitempty"`
	CreatedAt     int64   `json:"createdAt"`
	UpdatedAt     int64   `json:"updatedAt"`
}

// Account stores a single credential plus arbitrary extra fields.
type Account struct {
	ID         string  `json:"id"`
	PlatformID string  `json:"platformId"`
	Title      string  `json:"title"`
	Username   string  `json:"username"`
	Password   string  `json:"password"`
	URL        string  `json:"url"`
	Notes      string  `json:"notes"`
	Fields     []Field `json:"fields"`
	Favorite   bool    `json:"favorite"`
	CreatedAt  int64   `json:"createdAt"`
	UpdatedAt  int64   `json:"updatedAt"`
}

// Memo is a free-form encrypted note kept alongside credentials.
type Memo struct {
	ID        string `json:"id"`
	Title     string `json:"title"`
	Content   string `json:"content"`
	Pinned    bool   `json:"pinned"`
	CreatedAt int64  `json:"createdAt"`
	UpdatedAt int64  `json:"updatedAt"`
}

// Vault is the decrypted in-memory representation of all user data.
type Vault struct {
	Version   int        `json:"version"`
	Platforms []Platform `json:"platforms"`
	Accounts  []Account  `json:"accounts"`
	Memos     []Memo     `json:"memos"`
}

// vaultFile is the encrypted on-disk representation.
type vaultFile struct {
	Version    int    `json:"version"`
	KDF        string `json:"kdf"`
	Iterations int    `json:"iterations"`
	Salt       string `json:"salt"`
	Nonce      string `json:"nonce"`
	Data       string `json:"data"`
}

func newVault() *Vault {
	return &Vault{Version: vaultVersion, Platforms: []Platform{}, Accounts: []Account{}, Memos: []Memo{}}
}

func (v *Vault) normalize() {
	if v.Version == 0 {
		v.Version = vaultVersion
	}
	if v.Platforms == nil {
		v.Platforms = []Platform{}
	}
	for i := range v.Platforms {
		if v.Platforms[i].FieldTemplate == nil {
			v.Platforms[i].FieldTemplate = []Field{}
		}
		for j := range v.Platforms[i].FieldTemplate {
			ensureFieldDefaults(&v.Platforms[i].FieldTemplate[j])
		}
	}
	if v.Accounts == nil {
		v.Accounts = []Account{}
	}
	for i := range v.Accounts {
		if v.Accounts[i].Fields == nil {
			v.Accounts[i].Fields = []Field{}
		}
		for j := range v.Accounts[i].Fields {
			ensureFieldDefaults(&v.Accounts[i].Fields[j])
		}
	}
	if v.Memos == nil {
		v.Memos = []Memo{}
	}
}

func ensureFieldDefaults(f *Field) {
	if f.ID == "" {
		f.ID = newID()
	}
	if f.Type == "" {
		f.Type = "text"
	}
	f.Key = strings.TrimSpace(f.Key)
}

func randomBytes(n int) ([]byte, error) {
	b := make([]byte, n)
	if _, err := rand.Read(b); err != nil {
		return nil, err
	}
	return b, nil
}

func newID() string {
	b, err := randomBytes(16)
	if err != nil {
		// crypto/rand failure is unrecoverable in practice
		panic(err)
	}
	return hex.EncodeToString(b)
}

func b64(b []byte) string        { return base64.StdEncoding.EncodeToString(b) }
func unb64(s string) ([]byte, error) { return base64.StdEncoding.DecodeString(s) }

func deriveKey(password string, salt []byte, iter int) ([]byte, error) {
	if iter <= 0 {
		iter = kdfIterations
	}
	return pbkdf2.Key(sha256.New, password, salt, iter, keyLength)
}

func encryptVault(v *Vault, password string) (*vaultFile, error) {
	salt, err := randomBytes(16)
	if err != nil {
		return nil, err
	}
	key, err := deriveKey(password, salt, kdfIterations)
	if err != nil {
		return nil, err
	}
	return sealVault(v, key, salt, kdfIterations)
}

func sealVault(v *Vault, key, salt []byte, iter int) (*vaultFile, error) {
	plain, err := json.Marshal(v)
	if err != nil {
		return nil, err
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}
	nonce, err := randomBytes(gcm.NonceSize())
	if err != nil {
		return nil, err
	}
	ct := gcm.Seal(nil, nonce, plain, nil)
	return &vaultFile{
		Version:    vaultVersion,
		KDF:        vaultKDF,
		Iterations: iter,
		Salt:       b64(salt),
		Nonce:      b64(nonce),
		Data:       b64(ct),
	}, nil
}

func decryptVault(f *vaultFile, password string) (*Vault, []byte, error) {
	salt, err := unb64(f.Salt)
	if err != nil {
		return nil, nil, err
	}
	nonce, err := unb64(f.Nonce)
	if err != nil {
		return nil, nil, err
	}
	ct, err := unb64(f.Data)
	if err != nil {
		return nil, nil, err
	}
	key, err := deriveKey(password, salt, f.Iterations)
	if err != nil {
		return nil, nil, err
	}
	v, err := openVault(key, nonce, ct)
	if err != nil {
		return nil, nil, err
	}
	return v, key, nil
}

func openVault(key, nonce, ct []byte) (*Vault, error) {
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}
	plain, err := gcm.Open(nil, nonce, ct, nil)
	if err != nil {
		return nil, errBadPassword
	}
	var v Vault
	if err := json.Unmarshal(plain, &v); err != nil {
		return nil, err
	}
	v.normalize()
	return &v, nil
}

// ---- helpers used by the store ----

func findPlatform(v *Vault, id string) int {
	for i := range v.Platforms {
		if v.Platforms[i].ID == id {
			return i
		}
	}
	return -1
}

func findAccount(v *Vault, id string) int {
	for i := range v.Accounts {
		if v.Accounts[i].ID == id {
			return i
		}
	}
	return -1
}

func findMemo(v *Vault, id string) int {
	for i := range v.Memos {
		if v.Memos[i].ID == id {
			return i
		}
	}
	return -1
}

func sortVault(v *Vault) {
	sort.SliceStable(v.Platforms, func(i, j int) bool {
		return v.Platforms[i].CreatedAt < v.Platforms[j].CreatedAt
	})
	sort.SliceStable(v.Accounts, func(i, j int) bool {
		return v.Accounts[i].UpdatedAt > v.Accounts[j].UpdatedAt
	})
	sort.SliceStable(v.Memos, func(i, j int) bool {
		if v.Memos[i].Pinned != v.Memos[j].Pinned {
			return v.Memos[i].Pinned
		}
		return v.Memos[i].UpdatedAt > v.Memos[j].UpdatedAt
	})
}

// constantTimeEqual is used for token comparison.
func constantTimeEqual(a, b string) bool {
	return subtle.ConstantTimeCompare([]byte(a), []byte(b)) == 1
}

func nowUnix() int64 { return time.Now().Unix() }
