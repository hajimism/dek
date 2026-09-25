// Reads each PNG given and prints what CoreImage decodes from it, one line per file.
import CoreImage
import Foundation

let detector = CIDetector(
  ofType: CIDetectorTypeQRCode, context: nil,
  options: [CIDetectorAccuracy: CIDetectorAccuracyHigh])!
for path in CommandLine.arguments.dropFirst() {
  let image = CIImage(contentsOf: URL(fileURLWithPath: path))!
  let found = detector.features(in: image).compactMap { ($0 as? CIQRCodeFeature)?.messageString }
  print(found.first ?? "")
}
