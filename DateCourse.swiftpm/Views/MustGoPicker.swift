import SwiftUI

/// 꼭 갈 곳 고르기 (선택한 지역의 장소 목록)
struct MustGoPicker: View {
    let places: [Place]
    let onPick: (Place) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var query = ""

    private var filtered: [Place] {
        guard !query.isEmpty else { return places }
        return places.filter { $0.name.contains(query) || $0.summary.contains(query) }
    }

    var body: some View {
        NavigationStack {
            List(filtered) { place in
                Button {
                    onPick(place)
                    dismiss()
                } label: {
                    HStack(spacing: 12) {
                        Text(place.category.emoji).font(.title2)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(place.name).font(.headline)
                            Text("\(place.category.label) · ★\(String(format: "%.1f", place.rating)) · \(place.summary)")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                                .lineLimit(1)
                        }
                    }
                }
                .buttonStyle(.plain)
            }
            .searchable(text: $query, prompt: "장소 이름 검색")
            .navigationTitle("꼭 갈 곳")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("닫기") { dismiss() }
                }
            }
        }
        .preferredColorScheme(.dark)
    }
}
