import { FunctionComponent } from "react"
import { Editor } from "@monaco-editor/react"
import { CborDecodedData } from "@/types/Cbor"
import TextCmp from "../text/TextCmp"
import { styles } from "./cbor.styles"

interface CborDataDisplayProps {
  decodedData: CborDecodedData | null
  binaryData?: string
  selectedSchemaId: string
  selectedRule: string
}

const CborDataDisplay: FunctionComponent<CborDataDisplayProps> = ({
  decodedData,
  binaryData,
  selectedSchemaId,
  selectedRule,
}) => {
  if (decodedData?.dataJson) {
    return (
      <div style={styles.dataDisplay}>
        <Editor
          height="100%"
          language="json"
          value={decodedData.dataJson}
          theme="vs-dark"
          options={{
            readOnly: true,
            formatOnType: true,
            formatOnPaste: true,
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
          }}
        />
      </div>
    )
  }

  if (!decodedData?.error && selectedSchemaId && selectedRule) {
    return (
      <div style={styles.placeholder}>
        Ready to decode with {selectedSchemaId}::{selectedRule}
      </div>
    )
  }

  return (
    <div style={styles.fallbackContainer}>
      <div style={styles.placeholder}>
        CBOR format: place .cddl files in the cddl-schemas directory for schema validation.
        <br />
        Raw CBOR decode works without a schema when the payload is valid CBOR.
      </div>
      {binaryData && <TextCmp text={binaryData} />}
    </div>
  )
}

export default CborDataDisplay
