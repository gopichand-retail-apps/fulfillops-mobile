import { CameraView, useCameraPermissions } from "expo-camera"
import { useRef } from "react"
import { View } from "react-native"
import { text } from "../shared/content"
import { Button, Copy } from "../shared/ui"

export default function Scanner({ onScan, close }: { onScan: (barcode: string) => void; close: () => void }) {
  const [permission, ask] = useCameraPermissions()
  const accepted = useRef(false)
  return (
    <View style={{ gap: 10 }}>
      {permission?.granted ? (
        <CameraView
          style={{ minHeight: 200, borderRadius: 12 }}
          facing="back"
          onBarcodeScanned={(event) => {
            if (accepted.current) return
            accepted.current = true
            onScan(event.data)
            close()
          }}
          barcodeScannerSettings={{
            barcodeTypes: ["ean13", "ean8", "upc_a", "upc_e", "code128", "code39", "qr", "itf14"],
          }}
        />
      ) : (
        <>
          <Copy>{text("cameraDenied")}</Copy>
          {permission?.canAskAgain && (
            <Button
              label={text("scan")}
              press={() => {
                void ask().catch(close)
              }}
            />
          )}
        </>
      )}
      <Button secondary label={text("closeScan")} press={close} />
    </View>
  )
}
