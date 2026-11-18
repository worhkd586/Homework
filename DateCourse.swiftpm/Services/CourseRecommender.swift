import Foundation

/// 코스 추천 엔진 (규칙 기반).
///
/// 1. 시간대 흐름(예: 저녁 = 전시 → 식사 → 산책 → 술)을 뼈대로 쓴다.
/// 2. 꼭 갈 곳이 같은 카테고리 자리를 대신 차지한다.
/// 3. 시간이 모자라면 산책·쇼핑부터 뺀다. 시간 고정이면 그 앞뒤 구간에 나눠 담는다.
/// 4. 빈 자리는 평점은 높고 이동은 짧은, 그 시각에 영업 중인 곳으로 채운다.
/// 5. 실제 이동시간으로 시간표를 확정하고, 빠듯하면 경고한다.
///
/// 나중에 LLM 기반으로 바꾸더라도 화면은 recommend(...)만 부르면 된다.
struct CourseRecommender {
    let places: PlaceProvider
    let routes: RouteProvider

    init(places: PlaceProvider = MockPlaceProvider(), routes: RouteProvider = StraightLineRouteProvider()) {
        self.places = places
        self.routes = routes
    }

    private let travelBuffer = 15
    private let lightCategories: Set<Category> = [.walk, .shop]
    private let alternates: [Category: [Category]] = [
        .culture: [.activity, .shop],
        .activity: [.culture, .shop],
        .shop: [.walk, .culture],
        .walk: [.shop, .cafe],
        .cafe: [.walk],
        .bar: [.walk],
    ]

    private enum Item {
        case mustGo(MustGo)
        case fill(Category)
    }

    private struct Planned {
        let place: Place
        let mustGo: MustGo?
        let reason: String
    }

    func recommend(region: Region, slot: TimeSlot, mustGo: MustGo?) async throws -> Course {
        let start = slot.startMinute
        let end = slot.endMinute
        let candidates = try await places.places(in: region.id)
        var warnings: [String] = []

        if let mustGo, mustGo.place.regionId != region.id {
            warnings.append("‘\(mustGo.place.name)’은(는) 다른 지역에 있어서 이동이 길어질 수 있어요.")
        }

        // 1) 흐름 뼈대 + 꼭 갈 곳 자리
        var flow = slot.flow
        var before = flow
        var after: [Category] = []
        if let mustGo {
            let index: Int
            if let i = flow.firstIndex(of: mustGo.place.category) {
                index = i
            } else {
                index = flow.count / 2
                flow.insert(mustGo.place.category, at: index)
            }
            before = Array(flow[..<index])
            after = Array(flow[(index + 1)...])
        }

        // 2) 시간 배분
        if let mustGo, let fixed = mustGo.fixedMinute {
            before = keep(before, budget: fixed - travelBuffer - start)
            after = keep(after, budget: end - (fixed + mustGo.place.category.stayMinutes + travelBuffer))
        } else {
            let pinNeed = mustGo.map { minStay($0.place.category) + travelBuffer } ?? 0
            let all = before + after
            let split = before.count
            let kept = keepIndices(all, budget: end - start - pinNeed)
            before = kept.filter { $0 < split }.map { all[$0] }
            after = kept.filter { $0 >= split }.map { all[$0] }
        }

        var sequence: [Item] = before.map { .fill($0) }
        if let mustGo { sequence.append(.mustGo(mustGo)) }
        sequence += after.map { .fill($0) }

        // 3) 빈 자리에 장소 고르기
        var used = Set<String>()
        if let mustGo { used.insert(mustGo.place.id) }
        var planned: [Planned] = []
        var clock = start
        var previous: Place?

        for (i, item) in sequence.enumerated() {
            switch item {
            case .mustGo(let pin):
                if let previous {
                    clock += try await routes.travel(from: previous, to: pin.place).minutes
                }
                if let fixed = pin.fixedMinute { clock = max(clock, fixed) }
                let reason = pin.fixedMinute.map { "\(formatMinute($0))에 맞춘 꼭 갈 곳" } ?? "꼭 갈 곳 · 동선에 맞춰 순서를 정했어요"
                planned.append(Planned(place: pin.place, mustGo: pin, reason: reason))
                clock += pin.place.category.stayMinutes
                previous = pin.place

            case .fill(let category):
                let nextPin: Place? = sequence[(i + 1)...].compactMap { item -> Place? in
                    if case .mustGo(let pin) = item { return pin.place }
                    return nil
                }.first
                var best: (place: Place, score: Double, travel: Travel?)?
                for option in [category] + (alternates[category] ?? []) where best == nil {
                    for place in candidates where place.category == option && !used.contains(place.id) {
                        var toHere: Travel?
                        if let previous { toHere = try await routes.travel(from: previous, to: place) }
                        let arrive = clock + (toHere?.minutes ?? 0)
                        guard isOpen(place, from: arrive, to: arrive + minStay(option)) else { continue }
                        var toNext = 0
                        if let nextPin { toNext = try await routes.travel(from: place, to: nextPin).minutes }
                        let score = place.rating * 12 - Double(toHere?.minutes ?? 0) * 0.8 - Double(toNext) * 0.4
                        if best == nil || score > best!.score {
                            best = (place, score, toHere)
                        }
                    }
                }
                guard let chosen = best else {
                    warnings.append("\(formatMinute(clock))쯤 열려 있는 \(category.label) 장소가 없어 건너뛰었어요.")
                    continue
                }
                used.insert(chosen.place.id)
                var reason = "\(chosen.place.category.label) · ★\(String(format: "%.1f", chosen.place.rating))"
                if let travel = chosen.travel {
                    reason += " · 이전 장소에서 \(travel.isWalk ? "도보" : "대중교통") \(travel.minutes)분"
                }
                planned.append(Planned(place: chosen.place, mustGo: nil, reason: reason))
                clock += (chosen.travel?.minutes ?? 0) + chosen.place.category.stayMinutes
                previous = chosen.place
            }
        }

        // 4) 시간표 확정
        var legs: [Travel] = []
        for i in planned.indices.dropFirst() {
            legs.append(try await routes.travel(from: planned[i - 1].place, to: planned[i].place))
        }
        let stops = schedule(planned, legs: legs, start: start, end: end, warnings: &warnings)

        return Course(title: "\(region.name) \(slot.label) 코스", stops: stops, legs: legs, warnings: warnings)
    }

    // MARK: - 시간 계산

    private func minStay(_ category: Category) -> Int {
        Int(Double(category.stayMinutes) * 0.6)
    }

    private func keep(_ items: [Category], budget: Int) -> [Category] {
        keepIndices(items, budget: budget).map { items[$0] }
    }

    /// 예산(분) 안에 들어갈 때까지 가벼운 일정부터, 그다음 뒤에서부터 뺀다.
    private func keepIndices(_ items: [Category], budget: Int) -> [Int] {
        var kept = Array(items.indices)
        func need() -> Int { kept.reduce(0) { $0 + minStay(items[$1]) + travelBuffer } }
        while !kept.isEmpty && need() > budget {
            if let light = kept.lastIndex(where: { lightCategories.contains(items[$0]) }) {
                kept.remove(at: light)
            } else {
                kept.removeLast()
            }
        }
        return kept
    }

    func isOpen(_ place: Place, from: Int, to: Int) -> Bool {
        let open = place.openMinute
        var close = place.closeMinute
        if close <= open { close += 1440 }
        if open == 0 && close >= 1440 { return true }
        return [0, 1440, -1440].contains { from + $0 >= open && to + $0 <= close }
    }

    private func schedule(_ planned: [Planned], legs: [Travel], start: Int, end: Int, warnings: inout [String]) -> [CourseStop] {
        var stops: [CourseStop] = []
        var cursor = start
        for (i, item) in planned.enumerated() {
            let travelIn = i > 0 ? legs[i - 1].minutes : 0
            var arrive = cursor + travelIn
            let fixed = item.mustGo?.fixedMinute
            if let fixed {
                if i > 0 && arrive > fixed {
                    let suggest = Int((Double(arrive) / 10).rounded(.up)) * 10
                    warnings.append("\(planned[i - 1].place.name)에서 이동이 \(travelIn)분이라 \(formatMinute(fixed)) 도착이 빠듯해요. \(formatMinute(suggest))로 미루는 걸 추천해요.")
                }
                arrive = fixed
            }

            var stay = item.place.category.stayMinutes
            // 다음 일정이 시간 고정이거나 마지막이면 체류시간을 줄여서라도 맞춘다
            var limit: Int?
            if i + 1 < planned.count, let nextFixed = planned[i + 1].mustGo?.fixedMinute {
                limit = nextFixed - legs[i].minutes
            } else if i == planned.count - 1 {
                limit = end
            }
            if let limit, fixed == nil, arrive + stay > limit {
                stay = max(minStay(item.place.category), limit - arrive)
            }
            let leave = arrive + stay
            if i == planned.count - 1 && leave > end {
                warnings.append("마지막 일정이 \(formatMinute(leave))에 끝나서 예정보다 늦어져요.")
            }
            if item.mustGo != nil && !isOpen(item.place, from: arrive, to: leave) {
                warnings.append("‘\(item.place.name)’ 영업시간(\(formatMinute(item.place.openMinute))–\(formatMinute(item.place.closeMinute)))을 확인해 주세요.")
            }
            stops.append(CourseStop(
                place: item.place,
                arriveMinute: arrive,
                leaveMinute: leave,
                isMustGo: item.mustGo != nil,
                isFixedTime: fixed != nil,
                reason: item.reason
            ))
            cursor = leave
        }
        return stops
    }
}
