import SwiftUI

/// 추천 결과: 시간표 + 구간별 이동시간
struct CourseView: View {
    let course: Course

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                VStack(alignment: .leading, spacing: 4) {
                    Text(course.title).font(.largeTitle.bold())
                    Text("\(course.stops.count)곳 · 총 이동 \(course.totalTravelMinutes)분")
                        .foregroundStyle(.secondary)
                }

                ForEach(course.warnings, id: \.self) { warning in
                    Label(warning, systemImage: "exclamationmark.triangle.fill")
                        .font(.footnote)
                        .foregroundStyle(.yellow)
                        .padding(12)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(Color.yellow.opacity(0.1), in: RoundedRectangle(cornerRadius: 10))
                }

                ForEach(Array(course.stops.enumerated()), id: \.element.id) { index, stop in
                    StopRow(stop: stop)
                    if index < course.legs.count {
                        LegRow(travel: course.legs[index])
                    }
                }

                Text("장소는 아직 목업 데이터예요. 네이버 지도 연동 후 실제 장소로 바뀝니다.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .padding(.top, 8)
            }
            .padding(20)
        }
        .background(Color.black.ignoresSafeArea())
        .navigationBarTitleDisplayMode(.inline)
    }
}

private struct StopRow: View {
    let stop: CourseStop

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            VStack(alignment: .trailing, spacing: 2) {
                Text(formatMinute(stop.arriveMinute)).font(.headline.monospacedDigit())
                Text(formatMinute(stop.leaveMinute)).font(.caption.monospacedDigit()).foregroundStyle(.secondary)
            }
            .frame(width: 52, alignment: .trailing)
            .padding(.top, 12)

            VStack(alignment: .leading, spacing: 6) {
                HStack(alignment: .top) {
                    Text(stop.place.category.emoji).font(.title2)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(stop.place.name).font(.headline)
                        Text(stop.place.summary).font(.caption).foregroundStyle(.secondary)
                    }
                    Spacer(minLength: 0)
                    if stop.isMustGo {
                        Text(stop.isFixedTime ? "🔒 시간 고정" : "📌 꼭 갈 곳")
                            .font(.caption2.bold())
                            .padding(.horizontal, 8)
                            .padding(.vertical, 4)
                            .background(Color.pink.opacity(0.2), in: Capsule())
                    }
                }
                Text(stop.reason).font(.footnote).foregroundStyle(.secondary)
            }
            .padding(14)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color.white.opacity(0.07), in: RoundedRectangle(cornerRadius: 12))
        }
    }
}

private struct LegRow: View {
    let travel: Travel

    var body: some View {
        HStack(spacing: 6) {
            Text(travel.isWalk ? "🚶 도보" : "🚇 대중교통(어림)")
            Text("\(travel.minutes)분 · \(String(format: "%.1f", Double(travel.meters) / 1000))km")
        }
        .font(.footnote)
        .foregroundStyle(.secondary)
        .padding(.leading, 76)
    }
}
