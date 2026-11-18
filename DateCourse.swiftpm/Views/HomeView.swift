import SwiftUI

/// 한 화면에서 끝나는 코스 만들기: 지역 → 시간대 → (선택) 꼭 갈 곳 → 코스 짜줘
struct HomeView: View {
    @State private var regions: [Region] = []
    @State private var regionPlaces: [Place] = []
    @State private var region: Region?
    @State private var slot: TimeSlot = .evening
    @State private var mustGo: MustGo?
    @State private var showPicker = false
    @State private var course: Course?
    @State private var isLoading = false
    @State private var errorMessage: String?

    private let placeProvider: PlaceProvider = MockPlaceProvider()
    private let recommender = CourseRecommender()

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 28) {
                    header
                    section("어디서 만나요?") { regionGrid }
                    section("언제 만나요?") { slotRow }
                    section("꼭 갈 곳 있어요? (선택)") { mustGoRow }
                    if let errorMessage {
                        Text(errorMessage).font(.footnote).foregroundStyle(.red)
                    }
                }
                .padding(20)
            }
            .safeAreaInset(edge: .bottom) { makeButton }
            .background(Color.black.ignoresSafeArea())
            .navigationDestination(item: $course) { course in
                CourseView(course: course)
            }
            .sheet(isPresented: $showPicker) {
                MustGoPicker(places: regionPlaces) { place in
                    mustGo = MustGo(place: place, fixedMinute: nil)
                }
            }
            .task {
                regions = (try? await placeProvider.regions()) ?? []
            }
            .onChange(of: region) { _, newRegion in
                mustGo = nil
                regionPlaces = []
                guard let newRegion else { return }
                Task { regionPlaces = (try? await placeProvider.places(in: newRegion.id)) ?? [] }
            }
        }
    }

    // MARK: - 섹션

    private var header: some View {
        VStack(alignment: .leading, spacing: 6) {
            (Text("오늘").foregroundStyle(.pink) + Text("어디가"))
                .font(.system(size: 30, weight: .black))
            Text("지역과 시간만 고르면 데이트 코스를 짜 드려요.")
                .foregroundStyle(.secondary)
        }
    }

    private func section<Content: View>(_ title: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(title).font(.title3.bold())
            content()
        }
    }

    private var regionGrid: some View {
        LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 10) {
            ForEach(regions) { item in
                Button {
                    region = item
                } label: {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(item.name).font(.headline)
                        Text(item.tagline).font(.caption).foregroundStyle(.secondary).lineLimit(1)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(14)
                    .background(cardBackground(selected: region == item))
                }
                .buttonStyle(.plain)
            }
        }
    }

    private var slotRow: some View {
        HStack(spacing: 8) {
            ForEach(TimeSlot.allCases) { item in
                Button {
                    slot = item
                    mustGo?.fixedMinute = nil
                } label: {
                    VStack(spacing: 4) {
                        Text(item.emoji).font(.title2)
                        Text(item.label).font(.subheadline.bold())
                        Text("\(formatMinute(item.startMinute))~").font(.caption2).foregroundStyle(.secondary)
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 12)
                    .background(cardBackground(selected: slot == item))
                }
                .buttonStyle(.plain)
            }
        }
    }

    @ViewBuilder
    private var mustGoRow: some View {
        if region == nil {
            Text("지역을 먼저 골라 주세요.").foregroundStyle(.secondary)
        } else if let mustGo {
            VStack(alignment: .leading, spacing: 12) {
                HStack {
                    Text("\(mustGo.place.category.emoji) \(mustGo.place.name)").font(.headline)
                    Spacer()
                    Button {
                        self.mustGo = nil
                    } label: {
                        Image(systemName: "xmark.circle.fill").foregroundStyle(.secondary)
                    }
                }
                Toggle("시간이 정해져 있어요 (예약 등)", isOn: isFixedBinding)
                if mustGo.fixedMinute != nil {
                    DatePicker("도착 시간", selection: fixedTimeBinding, displayedComponents: .hourAndMinute)
                }
            }
            .padding(14)
            .background(cardBackground(selected: true))
        } else {
            Button {
                showPicker = true
            } label: {
                Label("장소 추가", systemImage: "plus")
                    .frame(maxWidth: .infinity)
                    .padding(14)
                    .background(cardBackground(selected: false))
            }
            .buttonStyle(.plain)
        }
    }

    private var makeButton: some View {
        Button {
            Task { await makeCourse() }
        } label: {
            Group {
                if isLoading {
                    ProgressView()
                } else {
                    Text("코스 짜줘").font(.headline)
                }
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 16)
            .background(region == nil ? Color.gray.opacity(0.3) : Color.pink, in: RoundedRectangle(cornerRadius: 12))
            .foregroundStyle(.white)
        }
        .disabled(region == nil || isLoading)
        .padding(.horizontal, 20)
        .padding(.bottom, 8)
        .background(Color.black.opacity(0.9))
    }

    // MARK: - 동작

    private func makeCourse() async {
        guard let region else { return }
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }
        do {
            course = try await recommender.recommend(region: region, slot: slot, mustGo: mustGo)
        } catch {
            errorMessage = "코스를 만들지 못했어요: \(error.localizedDescription)"
        }
    }

    private var isFixedBinding: Binding<Bool> {
        Binding(
            get: { mustGo?.fixedMinute != nil },
            set: { isOn in mustGo?.fixedMinute = isOn ? slot.startMinute + 120 : nil }
        )
    }

    private var fixedTimeBinding: Binding<Date> {
        Binding(
            get: {
                let minute = (mustGo?.fixedMinute ?? slot.startMinute) % 1440
                return Calendar.current.date(bySettingHour: minute / 60, minute: minute % 60, second: 0, of: Date()) ?? Date()
            },
            set: { date in
                let parts = Calendar.current.dateComponents([.hour, .minute], from: date)
                var minute = (parts.hour ?? 0) * 60 + (parts.minute ?? 0)
                if minute < 6 * 60 { minute += 1440 } // 자정 넘김 (예: 00:30)
                mustGo?.fixedMinute = minute
            }
        )
    }

    private func cardBackground(selected: Bool) -> some View {
        RoundedRectangle(cornerRadius: 12)
            .fill(selected ? Color.pink.opacity(0.18) : Color.white.opacity(0.07))
            .overlay(
                RoundedRectangle(cornerRadius: 12)
                    .stroke(selected ? Color.pink : Color.clear, lineWidth: 1.5)
            )
    }
}
