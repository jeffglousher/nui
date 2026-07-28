package cddlschema

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/require"
)

const personCddl = "person = { name: tstr, age: uint }\n"

func setupRepo(t *testing.T) (CddlRepo, string) {
	t.Helper()
	dir := t.TempDir()
	writeFile(t, filepath.Join(dir, "simple.cddl"), personCddl)
	writeFile(t, filepath.Join(dir, "simple2.cddl"), "product = { id: int }\n")
	writeFile(t, filepath.Join(dir, "notes.txt"), "not a schema")
	require.NoError(t, os.MkdirAll(filepath.Join(dir, "orders"), 0755))
	writeFile(t, filepath.Join(dir, "orders", "order.cddl"), "order = { id: int }\n")

	repo, err := NewFileSystemCddlRepo(dir)
	require.NoError(t, err)
	return repo, dir
}

func writeFile(t *testing.T, path, content string) {
	t.Helper()
	require.NoError(t, os.WriteFile(path, []byte(content), 0644))
}

func TestFileSystemCddlRepo_All(t *testing.T) {
	repo, _ := setupRepo(t)

	all, err := repo.All()
	require.NoError(t, err)

	ids := make([]string, 0, len(all))
	for id := range all {
		ids = append(ids, id)
	}
	// files that are not .cddl are ignored, nested ones keep a slash in their id
	require.ElementsMatch(t, []string{"simple", "simple2", "orders/order"}, ids)
	require.Equal(t, personCddl, all["simple"].Content)
	require.Equal(t, "orders/order.cddl", all["orders/order"].Name)
}

func TestFileSystemCddlRepo_AllCreatesMissingDir(t *testing.T) {
	dir := filepath.Join(t.TempDir(), "cddlschemas")
	repo, err := NewFileSystemCddlRepo(dir)
	require.NoError(t, err)

	all, err := repo.All()
	require.NoError(t, err)
	require.Empty(t, all)
	require.DirExists(t, dir)
}

func TestFileSystemCddlRepo_GetById(t *testing.T) {
	repo, _ := setupRepo(t)

	schema, err := repo.GetById("simple")
	require.NoError(t, err)
	require.Equal(t, "simple", schema.ID)
	require.Equal(t, "simple.cddl", schema.Name)
	require.Equal(t, personCddl, schema.Content)
}

func TestFileSystemCddlRepo_GetByIdNested(t *testing.T) {
	repo, _ := setupRepo(t)

	schema, err := repo.GetById("orders/order")
	require.NoError(t, err)
	require.Equal(t, "orders/order", schema.ID)
	require.Equal(t, "orders/order.cddl", schema.Name)
}

func TestFileSystemCddlRepo_GetByIdErrors(t *testing.T) {
	repo, dir := setupRepo(t)
	writeFile(t, filepath.Join(filepath.Dir(dir), "outside.cddl"), "secret = tstr\n")

	tests := []struct {
		name string
		id   string
	}{
		{"empty id", ""},
		{"unknown id", "nope"},
		{"not a cddl file", "notes"},
		{"escaping the schemas dir", "../outside"},
		{"escaping with slashes", "../../outside"},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			schema, err := repo.GetById(test.id)
			require.Error(t, err)
			require.Nil(t, schema)
		})
	}
}
