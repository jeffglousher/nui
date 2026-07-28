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
  /** unset where there is no payload to detect a rule from, as when writing one */
  showAutoDetect?: boolean
  /** both choices on one line, without the words that repeat what the lists say */
  compact?: boolean
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
  showAutoDetect = true,
  compact = false,
}) => {
  return (
    <div style={compact ? styles.controlsCompact : styles.controls}>
      {(isAutoDetecting || isLoadingSchemas) && (
        <div style={styles.statusMessage}>
          {isLoadingSchemas
            ? "Loading CDDL schemas..."
            : "Auto-detecting best CDDL file + rule combination..."}
        </div>
      )}

      <div style={styles.controlGroup}>
        {!compact && <label style={styles.controlLabel}>Schema:</label>}
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
              title="look for .cddl files again"
            >
              {compact ? "\u21bb" : "Refresh"}
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
          {!compact && <label style={styles.controlLabel}>Type:</label>}
          <select
            value={selectedRule}
            onChange={(e) => onRuleChange(e.target.value)}
            style={styles.select}
            title="the CDDL rule the payload is written as (helpers like uuid stay available)"
          >
            <option value="">Select type...</option>
            {availableRules.map((rule) => (
              <option key={rule} value={rule}>
                {rule}
              </option>
            ))}
          </select>
          {showAutoDetect && (
            <button onClick={onAutoDetect} disabled={isAutoDetecting} style={styles.buttonSmall}>
              {isAutoDetecting ? "Detecting..." : "Auto-detect"}
            </button>
          )}
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
