import { FunctionComponent } from "react"
import { CddlSchema } from "@/types/Cbor"
import { styles } from "./cbor.styles"

interface SchemaSelectorProps {
  schemas: CddlSchema[]
  selectedSchemaId: string
  selectedRule: string
  availableRules: string[]
  isLoadingSchemas: boolean
  isAutoDetecting: boolean
  onSchemaChange: (schemaId: string) => void
  onRuleChange: (rule: string) => void
  onRefreshSchemas: () => void
  onAutoDetect: () => void
  onDone?: () => void
  showDoneButton?: boolean
}

const SchemaSelector: FunctionComponent<SchemaSelectorProps> = ({
  schemas,
  selectedSchemaId,
  selectedRule,
  availableRules,
  isLoadingSchemas,
  isAutoDetecting,
  onSchemaChange,
  onRuleChange,
  onRefreshSchemas,
  onAutoDetect,
  onDone,
  showDoneButton = false,
}) => {
  return (
    <div style={styles.controls}>
      {(isAutoDetecting || isLoadingSchemas) && (
        <div style={styles.statusMessage}>
          {isLoadingSchemas
            ? "Loading CDDL schemas..."
            : "Auto-detecting best CDDL file + rule combination..."}
        </div>
      )}

      <div style={styles.controlGroup}>
        <label style={styles.controlLabel}>Schema:</label>
        {schemas.length > 0 ? (
          <>
            <select
              value={selectedSchemaId}
              onChange={(e) => onSchemaChange(e.target.value)}
              disabled={isLoadingSchemas}
              style={styles.select}
            >
              <option value="">Select schema...</option>
              {schemas.map((schema) => (
                <option key={schema.id || schema.name} value={schema.id || schema.name}>
                  {schema.name} {schema.error && "(Error)"}
                </option>
              ))}
            </select>
            <button
              onClick={onRefreshSchemas}
              disabled={isLoadingSchemas}
              style={styles.buttonSmall}
            >
              Refresh
            </button>
          </>
        ) : (
          <span style={styles.noSchemasMessage}>
            No schemas found. Place .cddl files in the cddl-schemas directory.
          </span>
        )}
      </div>

      {selectedSchemaId && availableRules.length > 0 && (
        <div style={styles.controlGroup}>
          <label style={styles.controlLabel}>Rule:</label>
          <select
            value={selectedRule}
            onChange={(e) => onRuleChange(e.target.value)}
            style={styles.select}
          >
            <option value="">Select rule...</option>
            {availableRules.map((rule) => (
              <option key={rule} value={rule}>
                {rule}
              </option>
            ))}
          </select>
          <button onClick={onAutoDetect} disabled={isAutoDetecting} style={styles.buttonSmall}>
            {isAutoDetecting ? "Detecting..." : "Auto-detect"}
          </button>
          {showDoneButton && onDone && (
            <button onClick={onDone} style={styles.buttonSmall}>
              Done
            </button>
          )}
        </div>
      )}
    </div>
  )
}

export default SchemaSelector
