import { FunctionComponent, useMemo } from "react"
import { CborField } from "@/utils/cbor/shape"
import { fromPayload } from "@/utils/cbor/value"
import { styles } from "./cbor.styles"
import FieldView from "./fields/FieldView"

interface Props {
  field: CborField
  /** the payload as it arrived, one character per byte */
  payload: string
}

/**
 * A decoded payload read through the rule it matches.
 *
 * The same fields that compose a message show it: every value sits under the
 * name the schema gives it, with its type and its comment a disclosure away.
 */
const CborStructured: FunctionComponent<Props> = ({ field, payload }) => {
  const { value, error } = useMemo(() => fromPayload(field, payload), [field, payload])

  if (error) return <div style={styles.placeholder}>{error}</div>

  return (
    <div style={styles.form}>
      <FieldView readOnly
        field={field}
        value={value}
        onChange={() => undefined}
      />
    </div>
  )
}

export default CborStructured
