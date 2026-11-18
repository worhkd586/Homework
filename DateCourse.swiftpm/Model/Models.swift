import Foundation

enum Category: String, CaseIterable {
    case restaurant, cafe, activity, culture, shop, walk, bar

    var label: String {
        switch self {
        case .restaurant: return "식사"
        case .cafe: return "카페"
        case .activity: return "체험"
        case .culture: return "전시·관람"
        case .shop: return "쇼핑"
        case .walk: return "산책"
        case .bar: return "술 한잔"
        }
    }

    var emoji: String {
        switch self {
        case .restaurant: return "🍽️"
        case .cafe: return "☕"
        case .activity: return "🎯"
        case .culture: return "🖼️"
        case .shop: return "🛍️"
        case .walk: return "🌿"
        case .bar: return "🍷"
        }
    }

    /// 평균 체류 시간(분)
    var stayMinutes: Int {
        switch self {
        case .restaurant: return 80
        case .cafe: return 60
        case .activity, .culture: return 75
        case .shop: return 45
        case .walk: return 40
        case .bar: return 90
        }
    }
}

struct Region: Identifiable, Hashable {
    let id: String
    let name: String
    let tagline: String
    let lat: Double
    let lng: Double
}

struct Place: Identifiable, Hashable {
    let id: String
    let name: String
    let regionId: String
    let category: Category
    let lat: Double
    let lng: Double
    let rating: Double
    /// 영업 시작·종료 (분, 0 = 00:00). 자정을 넘기면 1440보다 큼
    let openMinute: Int
    let closeMinute: Int
    let tags: [String]
    let summary: String
}

enum TimeSlot: String, CaseIterable, Identifiable {
    case lunch, afternoon, evening, night

    var id: String { rawValue }

    var label: String {
        switch self {
        case .lunch: return "점심"
        case .afternoon: return "오후"
        case .evening: return "저녁"
        case .night: return "밤"
        }
    }

    var emoji: String {
        switch self {
        case .lunch: return "🍝"
        case .afternoon: return "☀️"
        case .evening: return "🌆"
        case .night: return "🌙"
        }
    }

    var startMinute: Int {
        switch self {
        case .lunch: return 11 * 60 + 30
        case .afternoon: return 13 * 60
        case .evening: return 17 * 60
        case .night: return 19 * 60
        }
    }

    var endMinute: Int {
        switch self {
        case .lunch: return 15 * 60
        case .afternoon: return 18 * 60
        case .evening: return 22 * 60
        case .night: return 24 * 60
        }
    }

    /// 이 시간대의 자연스러운 흐름
    var flow: [Category] {
        switch self {
        case .lunch: return [.restaurant, .cafe, .walk]
        case .afternoon: return [.activity, .cafe, .shop, .walk]
        case .evening: return [.culture, .restaurant, .walk, .bar]
        case .night: return [.restaurant, .walk, .bar]
        }
    }
}

/// 여자친구가 미리 정해둔 "꼭 갈 곳". 시간이 정해져 있으면 그 시각에 맞춰 코스를 짠다.
struct MustGo: Hashable {
    var place: Place
    var fixedMinute: Int?
}

struct Travel: Hashable {
    let minutes: Int
    let meters: Int
    let isWalk: Bool
}

struct CourseStop: Identifiable, Hashable {
    var id: String { place.id }
    let place: Place
    let arriveMinute: Int
    let leaveMinute: Int
    let isMustGo: Bool
    let isFixedTime: Bool
    let reason: String
}

struct Course: Hashable {
    let title: String
    let stops: [CourseStop]
    /// legs[i] = stops[i] → stops[i+1]
    let legs: [Travel]
    let warnings: [String]

    var totalTravelMinutes: Int { legs.reduce(0) { $0 + $1.minutes } }
}

func formatMinute(_ minute: Int) -> String {
    let m = ((minute % 1440) + 1440) % 1440
    return String(format: "%02d:%02d", m / 60, m % 60)
}
