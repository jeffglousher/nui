package cddlschema

import (
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"strings"
)

// FileSystemCddlRepo implements CddlRepo using filesystem storage
type FileSystemCddlRepo struct {
	baseDir string
}

// NewFileSystemCddlRepo creates a new filesystem-based CDDL schema repository
func NewFileSystemCddlRepo(baseDir string) (CddlRepo, error) {
	return &FileSystemCddlRepo{baseDir: baseDir}, nil
}

// All returns all CDDL schemas from the filesystem
func (r *FileSystemCddlRepo) All() (map[string]*CddlSchema, error) {
	return r.AllInPath(r.baseDir)
}

func (r *FileSystemCddlRepo) AllInPath(dir string) (map[string]*CddlSchema, error) {
	if err := os.MkdirAll(dir, 0755); err != nil {
		return nil, fmt.Errorf("failed to create cddl directory %s: %w", dir, err)
	}
	schemas := make(map[string]*CddlSchema)

	err := filepath.WalkDir(dir, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}

		if d.IsDir() || !strings.HasSuffix(d.Name(), ".cddl") {
			return nil
		}

		relPath, err := filepath.Rel(dir, path)
		if err != nil {
			return nil
		}

		id := strings.TrimSuffix(relPath, ".cddl")
		// Normalize path separators for stable IDs across platforms
		id = filepath.ToSlash(id)
		relPath = filepath.ToSlash(relPath)

		schema, err := r.loadSchemaFromFile(path, id, relPath)
		if err != nil {
			return nil
		}

		schemas[id] = schema
		return nil
	})

	if err != nil {
		return nil, fmt.Errorf("failed to scan cddl directory: %w", err)
	}

	return schemas, nil
}

// GetById returns a CDDL schema by ID (relative path without extension)
func (r *FileSystemCddlRepo) GetById(id string) (*CddlSchema, error) {
	return r.GetByIdInPath(id, r.baseDir)
}

func (r *FileSystemCddlRepo) GetByIdInPath(id, dir string) (*CddlSchema, error) {
	if id == "" {
		return nil, errors.New("schema ID cannot be empty")
	}

	// Accept both slash styles in IDs from the API
	cleanID := filepath.Clean(filepath.FromSlash(id))
	// IDs come from the API: keep the lookup inside the schemas directory
	if filepath.IsAbs(cleanID) || cleanID == ".." || strings.HasPrefix(cleanID, ".."+string(filepath.Separator)) {
		return nil, errors.New("schema not found")
	}
	filePath := filepath.Join(dir, cleanID+".cddl")
	relPath := filepath.ToSlash(cleanID + ".cddl")

	if _, err := os.Stat(filePath); os.IsNotExist(err) {
		return nil, errors.New("schema not found")
	}

	return r.loadSchemaFromFile(filePath, filepath.ToSlash(cleanID), relPath)
}

func (r *FileSystemCddlRepo) loadSchemaFromFile(filePath, id, relPath string) (*CddlSchema, error) {
	content, err := os.ReadFile(filePath)
	if err != nil {
		return nil, fmt.Errorf("failed to read cddl file %s: %w", filePath, err)
	}

	return &CddlSchema{
		ID:      id,
		Name:    relPath,
		Content: string(content),
	}, nil
}
