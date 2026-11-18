import SwiftUI

@main
struct DateCourseApp: App {
    var body: some Scene {
        WindowGroup {
            HomeView()
                .preferredColorScheme(.dark)
                .tint(.pink)
        }
    }
}
