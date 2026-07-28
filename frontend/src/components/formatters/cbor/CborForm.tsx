import { Editor } from "@monaco-editor/react"
import { CSSProperties, FunctionComponent, useEffect, useMemo, useRef, useState } from "react"
import { useCddlSchema } from "@/hooks/useCddlSchema"
import { validateCborPayload } from "@/utils/cbor"
import { deriveShape } from "@/utils/cbor/shape"
import { CborValue, fromNotation, markedFields, toNotation, toPayloadOfValue } from "@/utils/cbor/value"
import { styles } from "./cbor.styles"
import FieldView from "./fields/FieldView"
import SchemaSelector from "./SchemaSelector"

interface Props {
  /** the payload being written, as CBOR diagnostic notation */
  text?: string
  subject?: string
  style?: CSSProperties
  onChange?: (text: string) => void
}

/**
 * Writing a CBOR payload through the rule it has to match.
 *
 * With a CDDL rule chosen the payload is written as the fields of that rule,
 * which is the only place the names, the types and the bounds of a message are
 * written down. Without one - an ad-hoc payload, or a rule too open to render -
 * it is written as CBOR text, which is what the fields produce anyway: the card
 * carries that text either way, so the two can be swapped freely.
 *
 * A form nobody has filled in yet is not a form full of mistakes. What is still
 * empty is counted quietly at the foot of the card; only a field holding
 * something its schema will not take is called out where it sits.
 */
const CborForm: FunctionComponent<Props> = ({ text, subject, style, onChange }) => {
  const {
    schemas,
    selectedSchemaId,
    selectedRule,
    isLoadingSchemas,
    isAutoDetecting,
    showSchemaControls,
    availableRules,
    selectedSchema,
    setSelectedSchemaId,
    setSelectedRule,
    setShowSchemaControls,
    refreshSchemas,
  } = useCddlSchema(undefined, subject)

  const [asText, setAsText] = useState(false)
  const [value, setValue] = useState<CborValue>(null)
  /** what the form last wrote, to tell its own text apart from text set elsewhere */
  const written = useRef<string>(null)

  const shape = useMemo(
    () => selectedSchema?.content && selectedRule ? deriveShape(selectedSchema.content, selectedRule) : undefined,
    [selectedSchema?.content, selectedRule],
  )
  const field = shape?.field

  // the fields start from whatever the card already holds, whether that came
  // from the text editor, from another card, or from a message being edited
  useEffect(() => {
    if (!field) return
    if (text == written.current) return
    setValue(fromNotation(field, text ?? "").value)
  }, [field, text])

  const check = useMemo(() => {
    if (!field || !value) return null
    const { payload, errors } = toPayloadOfValue(field, value)
    if (errors.length > 0) return { errors, valid: false, size: 0 }
    const verdict = validateCborPayload(payload, selectedSchema, selectedRule)
    return { errors: [], valid: verdict.valid, size: payload.length, mismatch: verdict.errors[0] }
  }, [field, value, selectedSchema, selectedRule])

  const wrong = useMemo(() => markedFields(check?.errors ?? []), [check])

  const handleChange = (next: CborValue) => {
    setValue(next)
    // a payload that cannot be written yet is no payload: the card must not
    // keep the last complete one and send that instead
    written.current = toNotation(field, next).text ?? ""
    onChange?.(written.current)
  }

  const handleText = (notation: string) => {
    written.current = notation
    onChange?.(notation ?? "")
  }

  const handleSwap = (next: boolean) => {
    // coming back from the text editor, the fields take up what was written there
    if (!next && field) setValue(fromNotation(field, text ?? "").value)
    setAsText(next)
  }

  const hasSelection = !!(selectedSchemaId && selectedRule)
  const showFields = !!field && !asText
  const choosing = showSchemaControls || !hasSelection

  return (
    <div style={{ ...style, ...styles.container }}>
      <div style={styles.schemaHeader}>
        {hasSelection && !choosing ? (
          <button style={styles.headerButton}
            title="use another schema or rule"
            onClick={() => setShowSchemaControls(true)}
          >
            {selectedSchema?.name} <span style={{ opacity: 0.5 }}>{"\u203a"}</span> {selectedRule} {"\u2304"}
          </button>
        ) : (
          <span style={styles.schemaText}>CBOR</span>
        )}

        {field && (
          <div style={styles.segmented}>
            <button style={{ ...styles.segment, ...(asText ? {} : styles.segmentOn) }}
              title="fill in the fields of the CDDL rule"
              onClick={() => handleSwap(false)}
            >
              Fields
            </button>
            <button style={{ ...styles.segment, ...(asText ? styles.segmentOn : {}) }}
              title="write the payload out: CBOR diagnostic notation, of which JSON is a subset"
              onClick={() => handleSwap(true)}
            >
              Text
            </button>
          </div>
        )}
      </div>

      {choosing && (
        <SchemaSelector
          schemas={schemas}
          selectedSchemaId={selectedSchemaId}
          selectedRule={selectedRule}
          availableRules={availableRules}
          isLoadingSchemas={isLoadingSchemas}
          isAutoDetecting={isAutoDetecting}
          onSchemaChange={setSelectedSchemaId}
          onRuleChange={rule => {
            setSelectedRule(rule)
            if (rule) setShowSchemaControls(false)
          }}
          onRefreshSchemas={refreshSchemas}
          onAutoDetect={() => setShowSchemaControls(false)}
          showAutoDetect={false}
          compact
        />
      )}

      {shape?.error && <div style={styles.errorContainer}>{shape.error}</div>}

      {showFields ? (
        <div style={styles.form}>
          {value && (
            <FieldView
              field={field}
              value={value}
              errors={wrong}
              onChange={handleChange}
            />
          )}
        </div>
      ) : (
        <div style={styles.dataDisplay}>
          <Editor
            height="100%"
            language="json"
            value={text ?? ""}
            theme="vs-dark"
            onChange={handleText}
            options={{ minimap: { enabled: false }, scrollBeyondLastLine: false }}
          />
        </div>
      )}

      <div style={styles.formFooter}>{statusOf()}</div>
    </div>
  )

  function statusOf() {
    if (!showFields) {
      return (
        <span style={styles.statusQuiet}>
          {hasSelection
            ? `written out as CBOR text, checked against ${selectedRule}`
            : `JSON works here, and so does h'01ff' and 32("a")`}
        </span>
      )
    }
    if (!check) return null

    const invalid = check.errors.filter(error => error.kind == "invalid")
    if (invalid.length > 0) return <span style={styles.statusWrong}>{invalid[0].message}</span>

    // naming what the payload is waiting on beats counting it: a rule where an
    // empty string is a fine answer would otherwise count fewer fields than the
    // reader can see sitting empty
    const missing = check.errors.map(error => nameOf(error.path))
    if (missing.length > 0) {
      return <span style={styles.statusQuiet}>{`waiting for ${listOf(missing)}`}</span>
    }
    if (!check.valid) return <span style={styles.statusWrong}>{check.mismatch}</span>

    return <span style={styles.statusReady}>{`ready \u00b7 ${check.size} bytes \u00b7 matches ${selectedRule}`}</span>
  }
}

export default CborForm

/** The name a field goes by, out of the path it sits at */
function nameOf(path: string): string {
  const last = path.split(".").pop()
  return !last || last == "$" ? "a value" : last
}

/**
 * The fields still to fill in, said as a person would say them.
 *
 * Two get named; past that the names stop helping and a count does the rest.
 */
function listOf(names: string[]): string {
  const said = [...new Set(names)]
  if (said.length == 1) return said[0]
  if (said.length == 2) return `${said[0]} and ${said[1]}`
  return `${said[0]}, ${said[1]} and ${said.length - 2} more`
}
