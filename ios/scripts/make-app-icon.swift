// Generates the 1024px app icon: the yellow FlexFund Kids dog on the brand gradient.
// Usage: swift scripts/make-app-icon.swift <dog.png> <out.png>
import CoreGraphics
import Foundation
import ImageIO
import UniformTypeIdentifiers

let args = CommandLine.arguments
let size = 1024
let space = CGColorSpaceCreateDeviceRGB()
let ctx = CGContext(data: nil, width: size, height: size, bitsPerComponent: 8, bytesPerRow: 0, space: space,
                    bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
func rgb(_ hex: UInt32) -> CGColor {
  CGColor(red: CGFloat((hex >> 16) & 0xFF) / 255, green: CGFloat((hex >> 8) & 0xFF) / 255, blue: CGFloat(hex & 0xFF) / 255, alpha: 1)
}
let gradient = CGGradient(colorsSpace: space, colors: [rgb(0xF63B75), rgb(0xD657AF), rgb(0xB473E7)] as CFArray, locations: [0, 0.5, 1])!
ctx.drawLinearGradient(gradient, start: CGPoint(x: 0, y: CGFloat(size)), end: CGPoint(x: CGFloat(size), y: 0), options: [])
// Soft white disc behind the mascot for contrast.
ctx.setFillColor(CGColor(red: 1, green: 1, blue: 1, alpha: 0.18))
ctx.fillEllipse(in: CGRect(x: 132, y: 132, width: 760, height: 760))
let src = CGImageSourceCreateWithURL(URL(fileURLWithPath: args[1]) as CFURL, nil)!
let dog = CGImageSourceCreateImageAtIndex(src, 0, nil)!
ctx.setShadow(offset: CGSize(width: 0, height: -18), blur: 40, color: CGColor(red: 0.34, green: 0.11, blue: 0.44, alpha: 0.45))
ctx.draw(dog, in: CGRect(x: 182, y: 170, width: 660, height: 660))
let out = ctx.makeImage()!
let dest = CGImageDestinationCreateWithURL(URL(fileURLWithPath: args[2]) as CFURL, UTType.png.identifier as CFString, 1, nil)!
CGImageDestinationAddImage(dest, out, nil)
CGImageDestinationFinalize(dest)
print("wrote \(args[2])")
