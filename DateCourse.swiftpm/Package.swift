// swift-tools-version: 5.9

// Xcode 또는 Mac/iPad의 Swift Playgrounds 앱에서 이 폴더(DateCourse.swiftpm)를 열면 바로 실행됩니다.

import PackageDescription
import AppleProductTypes

let package = Package(
    name: "DateCourse",
    platforms: [
        .iOS("17.0")
    ],
    products: [
        .iOSApplication(
            name: "오늘어디가",
            targets: ["AppModule"],
            bundleIdentifier: "com.worhkd586.datecourse",
            displayVersion: "0.1",
            bundleVersion: "1",
            appIcon: .placeholder(icon: .heart),
            accentColor: .presetColor(.pink),
            supportedDeviceFamilies: [
                .phone
            ],
            supportedInterfaceOrientations: [
                .portrait
            ]
        )
    ],
    targets: [
        .executableTarget(
            name: "AppModule",
            path: "."
        )
    ]
)
