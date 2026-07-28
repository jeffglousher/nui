package nui

import (
	"github.com/gofiber/fiber/v2"
	"github.com/nats-nui/nui/internal/cddlschema"
)

// HandleIndexCddlSchemas returns all CDDL schemas
func (a *App) HandleIndexCddlSchemas(c *fiber.Ctx) error {
	schemas, err := a.nui.CddlRepo.All()
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}

	result := make([]*cddlschema.CddlSchema, 0, len(schemas))
	for _, schema := range schemas {
		result = append(result, schema)
	}

	return c.JSON(result)
}

// HandleGetCddlSchema returns a specific CDDL schema
func (a *App) HandleGetCddlSchema(c *fiber.Ctx) error {
	id := c.Params("id")
	if id == "" {
		return c.Status(400).JSON(fiber.Map{"error": "schema ID is required"})
	}

	schema, err := a.nui.CddlRepo.GetById(id)
	if err != nil {
		return c.Status(404).JSON(fiber.Map{"error": err.Error()})
	}

	return c.JSON(schema)
}

// HandleServeCddlContent serves the raw CDDL schema content
func (a *App) HandleServeCddlContent(c *fiber.Ctx) error {
	id := c.Params("id")
	if id == "" {
		return c.Status(400).JSON(fiber.Map{"error": "schema ID is required"})
	}

	schema, err := a.nui.CddlRepo.GetById(id)
	if err != nil {
		return c.Status(404).JSON(fiber.Map{"error": err.Error()})
	}

	c.Set("Content-Type", "text/plain; charset=utf-8")
	c.Set("Content-Disposition", "attachment; filename=\""+schema.Name+"\"")
	return c.SendString(schema.Content)
}
