import Foundation

/// 장소 데이터의 경계. 지금은 MockPlaceProvider, 나중에 네이버 지역 검색 API로 교체.
protocol PlaceProvider {
    func regions() async throws -> [Region]
    func places(in regionId: String) async throws -> [Place]
}

/// 이동시간의 경계. 지금은 직선거리 추정, 나중에 대중교통 API(예: ODsay)로 교체.
/// (네이버 Directions는 자동차 경로만 제공)
protocol RouteProvider {
    func travel(from: Place, to: Place) async throws -> Travel
}

struct MockPlaceProvider: PlaceProvider {
    func regions() async throws -> [Region] { MockData.regions }

    func places(in regionId: String) async throws -> [Place] {
        MockData.places.filter { $0.regionId == regionId }
    }
}

struct StraightLineRouteProvider: RouteProvider {
    func travel(from: Place, to: Place) async throws -> Travel {
        let road = Int((haversineMeters(from.lat, from.lng, to.lat, to.lng) * 1.3).rounded())
        if road <= 1200 {
            return Travel(minutes: max(1, road / 70), meters: road, isWalk: true)
        }
        // 대기·환승 10분 + 평균 20km/h (어림값)
        return Travel(minutes: 10 + road / 333, meters: road, isWalk: false)
    }

    private func haversineMeters(_ lat1: Double, _ lng1: Double, _ lat2: Double, _ lng2: Double) -> Double {
        let r = 6_371_000.0
        let dLat = (lat2 - lat1) * .pi / 180
        let dLng = (lng2 - lng1) * .pi / 180
        let a = sin(dLat / 2) * sin(dLat / 2)
            + cos(lat1 * .pi / 180) * cos(lat2 * .pi / 180) * sin(dLng / 2) * sin(dLng / 2)
        return 2 * r * asin(sqrt(a))
    }
}
