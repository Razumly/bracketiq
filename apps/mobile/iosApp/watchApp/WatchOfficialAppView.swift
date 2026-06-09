import SwiftUI

private enum WatchPalette {
    static let background = Color(red: 0.02, green: 0.025, blue: 0.03)
    static let surface = Color(red: 0.07, green: 0.09, blue: 0.10)
    static let surfaceAlt = Color(red: 0.12, green: 0.15, blue: 0.17)
    static let accent = Color(red: 0.29, green: 0.90, blue: 0.58)
    static let danger = Color(red: 1.00, green: 0.42, blue: 0.42)
    static let warning = Color(red: 1.00, green: 0.82, blue: 0.40)
    static let muted = Color(red: 0.62, green: 0.66, blue: 0.69)
}

struct WatchOfficialAppView: View {
    @ObservedObject var viewModel: WatchOfficialViewModel

    var body: some View {
        ZStack(alignment: .bottom) {
            WatchPalette.background.ignoresSafeArea()
            content
            if viewModel.isLoading {
                Text("Loading")
                    .font(.caption2.weight(.bold))
                    .foregroundStyle(WatchPalette.warning)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 6)
                    .background(WatchPalette.surfaceAlt, in: Capsule())
                    .padding(.bottom, 4)
            }
        }
        .foregroundStyle(.white)
    }

    @ViewBuilder
    private var content: some View {
        switch viewModel.route {
        case .login:
            LoginScreen(viewModel: viewModel)
        case .matches:
            MatchListScreen(viewModel: viewModel)
        case .detail:
            MatchDetailScreen(viewModel: viewModel)
        case .incidentTypes:
            IncidentTypeScreen(viewModel: viewModel)
        case .players:
            PlayerScreen(viewModel: viewModel)
        case .minuteConfirm:
            MinuteConfirmScreen(viewModel: viewModel)
        }
    }
}

private struct LoginScreen: View {
    @ObservedObject var viewModel: WatchOfficialViewModel

    var body: some View {
        WatchScroll {
            Header(title: "MVP Official", subtitle: "watchOS")
            TextField("Email", text: $viewModel.email)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .watchFieldStyle()
            SecureField("Password", text: $viewModel.password)
                .watchFieldStyle()
            WatchButton(title: viewModel.isLoading ? "Signing in" : "Sign in") {
                viewModel.signIn()
            }
            StatusBanner(message: viewModel.error, isError: true)
        }
    }
}

private struct MatchListScreen: View {
    @ObservedObject var viewModel: WatchOfficialViewModel

    var body: some View {
        WatchScroll {
            Header(title: "Matches", subtitle: viewModel.currentUserLabel ?? "Official")
            if viewModel.matches.isEmpty {
                BodyText("No assigned matches.")
                WatchButton(title: "Refresh", secondary: true) {
                    viewModel.refresh()
                }
            } else {
                ForEach(viewModel.matches) { match in
                    Button {
                        viewModel.selectMatch(match.id)
                    } label: {
                        VStack(alignment: .leading, spacing: 3) {
                            Text(match.eventName)
                                .font(.caption.weight(.semibold))
                                .lineLimit(1)
                            Text(match.teamLabel)
                                .font(.caption2)
                                .lineLimit(1)
                            Text(match.timeAndFieldLabel)
                                .font(.caption2)
                                .foregroundStyle(WatchPalette.muted)
                                .lineLimit(1)
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(10)
                        .background(WatchPalette.surface, in: RoundedRectangle(cornerRadius: 8))
                    }
                    .buttonStyle(.plain)
                }
            }
            HStack(spacing: 8) {
                WatchButton(title: "Refresh", secondary: true) {
                    viewModel.refresh()
                }
                WatchButton(title: "Logout", secondary: true) {
                    viewModel.logout()
                }
            }
            StatusBanner(message: viewModel.error, isError: true)
            StatusBanner(message: viewModel.message, isError: false)
        }
    }
}

private struct MatchDetailScreen: View {
    @ObservedObject var viewModel: WatchOfficialViewModel

    var body: some View {
        guard let match = viewModel.selectedMatch else {
            return AnyView(EmptySelection { viewModel.back() })
        }
        return AnyView(
            WatchScroll {
                BackRow(title: "Match \(match.number)") {
                    viewModel.back()
                }
                Text(match.eventName)
                    .font(.caption.weight(.semibold))
                    .multilineTextAlignment(.center)
                    .lineLimit(2)
                BodyText(match.timeAndFieldLabel)
                ScoreBoard(match: match)
                SegmentTimer(match: match)
                if !match.officialCheckedIn {
                    WatchButton(title: "Check in") {
                        viewModel.checkIn()
                    }
                }
                HStack(spacing: 8) {
                    WatchButton(title: match.raw.activeSegment == nil ? "Start" : "Reset", secondary: match.raw.activeSegment != nil) {
                        if match.raw.activeSegment == nil {
                            viewModel.startTimer()
                        } else {
                            viewModel.resetTimer()
                        }
                    }
                    WatchButton(title: "End seg", secondary: true) {
                        viewModel.endSegment()
                    }
                }
                HStack(spacing: 8) {
                    WatchButton(title: "Next/OT", secondary: true) {
                        viewModel.startNextSegment()
                    }
                    WatchButton(title: "End match", color: WatchPalette.danger) {
                        viewModel.endMatch()
                    }
                }
                SectionLabel(text: "Incident")
                ForEach([match.team1, match.team2].compactMap { $0 }) { team in
                    WatchButton(title: team.label, secondary: true) {
                        viewModel.selectTeam(team.id)
                    }
                }
                StatusBanner(message: viewModel.error, isError: true)
                StatusBanner(message: viewModel.message, isError: false)
            }
        )
    }
}

private struct IncidentTypeScreen: View {
    @ObservedObject var viewModel: WatchOfficialViewModel

    var body: some View {
        guard let match = viewModel.selectedMatch, let team = viewModel.selectedTeam else {
            return AnyView(EmptySelection { viewModel.back() })
        }
        return AnyView(
            WatchScroll {
                BackRow(title: team.label) {
                    viewModel.back()
                }
                ForEach(match.rules.incidentTypes) { type in
                    let requiresPlayer = type.requiresPlayer(rules: match.rules)
                    let suffix: String = {
                        if type.isScoring && !requiresPlayer {
                            return " +\(type.linkedPointDelta ?? 1)"
                        }
                        if requiresPlayer {
                            return " player"
                        }
                        return ""
                    }()
                    WatchButton(title: "\(type.displayLabel)\(suffix)", secondary: !type.isScoring) {
                        viewModel.selectIncident(type.code)
                    }
                }
                StatusBanner(message: viewModel.error, isError: true)
            }
        )
    }
}

private struct PlayerScreen: View {
    @ObservedObject var viewModel: WatchOfficialViewModel

    var body: some View {
        guard let match = viewModel.selectedMatch,
              let team = viewModel.selectedTeam,
              let type = viewModel.selectedIncidentType else {
            return AnyView(EmptySelection { viewModel.back() })
        }
        return AnyView(
            WatchScroll {
                BackRow(title: type.displayLabel) {
                    viewModel.back()
                }
                ForEach(team.players) { player in
                    WatchButton(title: player.playerLabel, secondary: true) {
                        viewModel.selectPlayer(player.participantUserId)
                    }
                }
                if !type.requiresPlayer(rules: match.rules) {
                    WatchButton(title: "No player", secondary: true) {
                        viewModel.selectPlayer(nil)
                    }
                }
                StatusBanner(message: viewModel.error, isError: true)
            }
        )
    }
}

private struct MinuteConfirmScreen: View {
    @ObservedObject var viewModel: WatchOfficialViewModel

    var body: some View {
        guard let team = viewModel.selectedTeam, let type = viewModel.selectedIncidentType else {
            return AnyView(EmptySelection { viewModel.back() })
        }
        return AnyView(
            WatchScroll {
                BackRow(title: type.displayLabel) {
                    viewModel.back()
                }
                Text(team.label)
                    .font(.caption.weight(.semibold))
                    .lineLimit(1)
                if let player = viewModel.selectedPlayer {
                    BodyText(player.playerLabel)
                }
                HStack(spacing: 8) {
                    RoundControl(title: "-") {
                        viewModel.adjustMinute(-1)
                    }
                    VStack(spacing: 0) {
                        Text("\(viewModel.incidentMinute)")
                            .font(.system(size: 30, weight: .bold, design: .rounded))
                        Text("min")
                            .font(.caption2)
                            .foregroundStyle(WatchPalette.muted)
                    }
                    .frame(maxWidth: .infinity, minHeight: 58)
                    .background(WatchPalette.surfaceAlt, in: RoundedRectangle(cornerRadius: 8))
                    RoundControl(title: "+") {
                        viewModel.adjustMinute(1)
                    }
                }
                WatchButton(title: "Confirm") {
                    viewModel.confirmIncident()
                }
                StatusBanner(message: viewModel.error, isError: true)
            }
        )
    }
}

private struct WatchScroll<Content: View>: View {
    @ViewBuilder let content: Content

    init(@ViewBuilder content: () -> Content) {
        self.content = content()
    }

    var body: some View {
        ScrollView {
            VStack(spacing: 8) {
                content
            }
            .frame(maxWidth: .infinity)
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
        }
    }
}

private struct Header: View {
    let title: String
    let subtitle: String?

    var body: some View {
        VStack(spacing: 2) {
            Text(title)
                .font(.headline.weight(.bold))
                .multilineTextAlignment(.center)
                .lineLimit(2)
            if let subtitle, !subtitle.isEmpty {
                Text(subtitle)
                    .font(.caption2)
                    .foregroundStyle(WatchPalette.muted)
                    .lineLimit(1)
            }
        }
        .frame(maxWidth: .infinity)
    }
}

private struct BackRow: View {
    let title: String
    let onBack: () -> Void

    var body: some View {
        HStack(spacing: 8) {
            Button(action: onBack) {
                Text("<")
                    .font(.headline.weight(.bold))
                    .frame(width: 32, height: 32)
                    .background(WatchPalette.surfaceAlt, in: Circle())
            }
            .buttonStyle(.plain)
            Text(title)
                .font(.headline.weight(.bold))
                .lineLimit(1)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
    }
}

private struct WatchButton: View {
    let title: String
    var secondary = false
    var color: Color? = nil
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(title)
                .font(.caption.weight(.bold))
                .lineLimit(1)
                .minimumScaleFactor(0.75)
                .frame(maxWidth: .infinity, minHeight: 38)
                .padding(.horizontal, 10)
                .background(background, in: Capsule())
                .foregroundStyle(foreground)
        }
        .buttonStyle(.plain)
    }

    private var background: Color {
        color ?? (secondary ? WatchPalette.surfaceAlt : WatchPalette.accent)
    }

    private var foreground: Color {
        if color != nil {
            return .white
        }
        return secondary ? .white : Color(red: 0.02, green: 0.14, blue: 0.06)
    }
}

private struct RoundControl: View {
    let title: String
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(title)
                .font(.title3.weight(.bold))
                .frame(width: 42, height: 42)
                .background(WatchPalette.surfaceAlt, in: Circle())
        }
        .buttonStyle(.plain)
    }
}

private struct ScoreBoard: View {
    let match: WatchMatch

    var body: some View {
        HStack(spacing: 8) {
            TeamScore(team: match.team1, score: match.score(for: match.team1?.id))
            TeamScore(team: match.team2, score: match.score(for: match.team2?.id))
        }
    }
}

private struct TeamScore: View {
    let team: WatchTeam?
    let score: Int

    var body: some View {
        VStack(spacing: 1) {
            Text("\(score)")
                .font(.title3.weight(.bold))
            Text(team?.label ?? "TBD")
                .font(.caption2)
                .foregroundStyle(WatchPalette.muted)
                .lineLimit(1)
        }
        .frame(maxWidth: .infinity, minHeight: 52)
        .background(WatchPalette.surface, in: RoundedRectangle(cornerRadius: 8))
    }
}

private struct SegmentTimer: View {
    let match: WatchMatch

    var body: some View {
        TimelineView(.periodic(from: Date(), by: 1)) { context in
            let active = match.raw.activeSegment
            VStack(spacing: 2) {
                Text(active.map { "\(match.rules.segmentLabel) \($0.sequence)" } ?? "No active segment")
                    .font(.caption2)
                    .foregroundStyle(WatchPalette.muted)
                    .lineLimit(1)
                Text(match.clockLabel(now: context.date))
                    .font(.system(size: 24, weight: .bold, design: .rounded))
                    .foregroundStyle(active == nil ? WatchPalette.muted : WatchPalette.accent)
            }
            .frame(maxWidth: .infinity, minHeight: 58)
            .background(WatchPalette.surface, in: RoundedRectangle(cornerRadius: 8))
        }
    }
}

private struct SectionLabel: View {
    let text: String

    var body: some View {
        Text(text)
            .font(.caption2.weight(.semibold))
            .foregroundStyle(WatchPalette.muted)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.top, 4)
    }
}

private struct BodyText: View {
    let text: String

    init(_ text: String) {
        self.text = text
    }

    var body: some View {
        Text(text)
            .font(.caption2)
            .foregroundStyle(WatchPalette.muted)
            .multilineTextAlignment(.center)
            .lineLimit(2)
    }
}

private struct StatusBanner: View {
    let message: String?
    let isError: Bool

    var body: some View {
        if let message, !message.isEmpty {
            Text(message)
                .font(.caption2)
                .foregroundStyle(isError ? WatchPalette.danger : WatchPalette.accent)
                .multilineTextAlignment(.center)
                .lineLimit(3)
                .padding(8)
                .frame(maxWidth: .infinity)
                .background((isError ? WatchPalette.danger : WatchPalette.accent).opacity(0.16), in: RoundedRectangle(cornerRadius: 8))
        }
    }
}

private struct EmptySelection: View {
    let onBack: () -> Void

    var body: some View {
        WatchScroll {
            BodyText("Nothing selected.")
            WatchButton(title: "Back") {
                onBack()
            }
        }
    }
}

private extension View {
    func watchFieldStyle() -> some View {
        self
            .font(.caption)
            .padding(.horizontal, 10)
            .frame(minHeight: 40)
            .background(WatchPalette.surface, in: RoundedRectangle(cornerRadius: 8))
    }
}

private extension WatchMatch {
    var teamLabel: String {
        "\(team1?.label ?? "TBD") vs \(team2?.label ?? "TBD")"
    }

    var timeAndFieldLabel: String {
        [startIso?.formattedStartTime, fieldLabel]
            .compactMap { $0 }
            .joined(separator: " - ")
            .trimmedOrNil ?? division ?? "Upcoming"
    }

    func score(for teamId: String?) -> Int {
        guard let teamId else { return 0 }
        return raw.orderedSegments.reduce(0) { total, segment in
            total + (segment.scores[teamId] ?? 0)
        }
    }

    func clockLabel(now: Date) -> String {
        guard let active = raw.activeSegment else {
            return 0.durationLabel
        }
        let elapsedSeconds = active.elapsedSeconds(now: now)
        guard rules.timekeeping.addedTimeEnabled,
              let durationSeconds = durationSeconds(forSequence: active.sequence) else {
            return elapsedSeconds.durationLabel
        }
        let offsetSeconds = regulationOffsetSeconds(for: active)
        if elapsedSeconds > durationSeconds {
            return "\((offsetSeconds + durationSeconds).durationLabel) +\((elapsedSeconds - durationSeconds).durationLabel)"
        }
        return (offsetSeconds + elapsedSeconds).durationLabel
    }

    private func durationSeconds(forSequence sequence: Int) -> Int? {
        let durationMinutes: Int?
        let index = sequence - 1
        if rules.timekeeping.segmentDurationMinutesBySequence.indices.contains(index) {
            durationMinutes = rules.timekeeping.segmentDurationMinutesBySequence[index]
        } else {
            durationMinutes = rules.timekeeping.segmentDurationMinutes
        }
        guard let durationMinutes, durationMinutes > 0 else {
            return nil
        }
        return durationMinutes * 60
    }

    private func regulationOffsetSeconds(for segment: WatchMatchSegmentDTO) -> Int {
        let sequence = max(1, segment.sequence)
        guard sequence > 1 else {
            return 0
        }
        return (1..<sequence).reduce(0) { total, index in
            total + (durationSeconds(forSequence: index) ?? 0)
        }
    }
}

private extension WatchPlayer {
    var playerLabel: String {
        [jerseyNumber.map { "#\($0)" }, label].compactMap { $0 }.joined(separator: " ")
    }
}

private extension WatchMatchSegmentDTO {
    func elapsedSeconds(now: Date) -> Int {
        guard let startedAt = startedAt.flatMap(Date.apiDate(from:)) else {
            return 0
        }
        let ended = endedAt.flatMap(Date.apiDate(from:)) ?? now
        return max(0, Int(ended.timeIntervalSince(startedAt)))
    }
}

private extension String {
    var formattedStartTime: String? {
        guard let date = Date.apiDate(from: self) else {
            return nil
        }
        let formatter = DateFormatter()
        formatter.dateFormat = "MMM d h:mm a"
        return formatter.string(from: date)
    }
}

private extension Int {
    var durationLabel: String {
        let clamped = Swift.max(0, self)
        let minutes = clamped / 60
        let seconds = clamped % 60
        return "\(minutes):\(String(format: "%02d", seconds))"
    }
}
