import { mkdir, writeFile } from "node:fs/promises"
import { join } from "node:path"
import expoPlugins from "expo/config-plugins"

const { withAndroidManifest, withDangerousMod } = expoPlugins

export default function withOrderFlowPolicies(config) {
  return withDangerousMod(
    withAndroidManifest(config, (mod) => {
      const application = mod.modResults.manifest.application?.[0]
      if (!application) throw new Error("Android application manifest is missing")
      application.$["android:allowBackup"] = "false"
      application.$["android:fullBackupContent"] = "@xml/orderflow_full_backup"
      application.$["android:dataExtractionRules"] = "@xml/orderflow_data_extraction"
      application.$["android:usesCleartextTraffic"] = "false"
      return mod
    }),
    [
      "android",
      async (mod) => {
        const resource = join(mod.modRequest.platformProjectRoot, "app", "src", "main", "res", "xml")
        const standardDomains = ["root", "file", "database", "sharedpref", "external"]
        const deviceDomains = ["device_root", "device_file", "device_database", "device_sharedpref"]
        const exclude = (domains) => domains.map((domain) => `<exclude domain="${domain}" path="." />`).join("\n")
        const standardExclusions = exclude(standardDomains)
        const allExclusions = exclude([...standardDomains, ...deviceDomains])
        await mkdir(resource, { recursive: true })
        await writeFile(
          join(resource, "orderflow_full_backup.xml"),
          `<full-backup-content>${standardExclusions}</full-backup-content>\n`,
        )
        await writeFile(
          join(resource, "orderflow_data_extraction.xml"),
          `<data-extraction-rules><cloud-backup>${allExclusions}</cloud-backup><device-transfer>${allExclusions}</device-transfer></data-extraction-rules>\n`,
        )
        return mod
      },
    ],
  )
}
