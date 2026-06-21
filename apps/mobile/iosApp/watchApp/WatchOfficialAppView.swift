import SwiftUI

private enum WatchPalette {
    static let background = Color(red: 0.02, green: 0.025, blue: 0.03)
    static let surface = Color(red: 0.07, green: 0.09, blue: 0.10)
    static let surfaceAlt = Color(red: 0.12, green: 0.15, blue: 0.17)
    static let accent = Color(red: 0.29, green: 0.90, blue: 0.58)
    static let danger = Color(red: 1.00, green: 0.42, blue: 0.42)
    static let warning = Color(red: 1.00, green: 0.82, blue: 0.40)
    static let home = Color(red: 0.04, green: 0.24, blue: 0.55)
    static let away = Color(red: 0.65, green: 0.05, blue: 0.12)
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
                    .padding(.horizontal, 10)
                    .padding(.vertical, 5)
                    .background(WatchPalette.surfaceAlt, in: Capsule())
                    .padding(.bottom, 2)
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
        case .timer:
            TimerScreen(viewModel: viewModel)
        case .teamPick:
            TeamScorePickerScreen(viewModel: viewModel)
        case .actionMenu:
            ActionMenuScreen(viewModel: viewModel)
        case .incidentList:
            IncidentListScreen(viewModel: viewModel)
        case .incidentEditor:
            IncidentEditorScreen(viewModel: viewModel)
        case .incidentTypes:
            IncidentTypeScreen(viewModel: viewModel)
        case .incidentTeams:
            IncidentTeamScreen(viewModel: viewModel)
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
        ScrollScreen {
            Header(title: "BracketIQ", subtitle: "Officials")
            TextField("Email", text: $viewModel.email)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .watchFieldStyle()
            SecureField("Password", text: $viewModel.password)
                .watchFieldStyle()
            CompactButton(title: viewModel.isLoading ? "Signing in" : "Sign in") {
                viewModel.signIn()
            }
            StatusBanner(message: viewModel.error, isError: true)
        }
    }
}

private struct MatchListScreen: View {
    @ObservedObject var viewModel: WatchOfficialViewModel

    var body: some View {
        ScrollScreen(horizontalPadding: 8, verticalPadding: 6, spacing: 6) {
            Header(title: "Matches", subtitle: viewModel.currentUserLabel ?? "Officials")
            if viewModel.matches.isEmpty {
                BodyText("No assigned matches.")
                CompactButton(title: "Refresh", secondary: true) {
                    viewModel.refresh()
                }
            } else {
                ForEach(viewModel.matches) { match in
                    Button {
                        viewModel.selectMatch(match.id)
                    } label: {
                        MatchRow(match: match)
                    }
                    .buttonStyle(.plain)
                }
            }
            HStack(spacing: 6) {
                CompactButton(title: "Refresh", secondary: true) {
                    viewModel.refresh()
                }
                CompactButton(title: "Logout", secondary: true) {
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
        if let match = viewModel.selectedMatch {
            ZStack(alignment: .topLeading) {
                VStack(spacing: 6) {
                    Spacer(minLength: 14)
                    Text("Match \(match.numberLabel)")
                        .font(.caption.weight(.bold))
                        .foregroundStyle(WatchPalette.accent)
                        .lineLimit(1)
                    Text(match.teamLabel)
                        .font(.system(size: 17, weight: .bold))
                        .multilineTextAlignment(.center)
                        .lineLimit(2)
                        .fixedSize(horizontal: false, vertical: true)
                    Text(match.timeAndFieldLabel)
                        .font(.caption2)
                        .foregroundStyle(WatchPalette.muted)
                        .lineLimit(1)
                        .minimumScaleFactor(0.75)
                    actionButtons(for: match)
                    StatusBanner(message: viewModel.error, isError: true)
                    StatusBanner(message: viewModel.message, isError: false)
                    Spacer(minLength: 4)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .padding(.horizontal, 20)
                .padding(.top, 8)

                BackButton {
                    viewModel.back()
                }
                .padding(.leading, 10)
                .padding(.top, 8)
            }
        } else {
            EmptySelection {
                viewModel.back()
            }
        }
    }

    @ViewBuilder
    private func actionButtons(for match: WatchMatch) -> some View {
        if !match.officialCheckedIn {
            CompactButton(title: "Check in") {
                viewModel.checkIn()
            }
        } else if match.raw.activeSegment != nil {
            CompactButton(title: "Timer") {
                viewModel.openTimer()
            }
        } else if match.isFinished {
            CompactButton(title: "Finished", secondary: true, enabled: false) {}
        } else if match.shouldOfferFinishAndStart {
            VStack(spacing: 5) {
                CompactButton(title: match.startSegmentActionLabel) {
                    viewModel.startTimer()
                }
                CompactButton(title: "Finish Match", secondary: true) {
                    viewModel.endMatch()
                }
            }
        } else if match.canStartSegmentFromDetail {
            CompactButton(title: match.startSegmentActionLabel) {
                viewModel.startTimer()
            }
        } else {
            CompactButton(title: "Finish Match", color: WatchPalette.danger) {
                viewModel.endMatch()
            }
        }
    }
}

private struct TimerScreen: View {
    @ObservedObject var viewModel: WatchOfficialViewModel

    var body: some View {
        if let match = viewModel.selectedMatch {
            Button {
                viewModel.showTeamPicker()
            } label: {
                TimelineView(.periodic(from: Date(), by: 1)) { context in
                    let clock = match.clockDisplay(now: context.date)
                    ZStack {
                        WatchPalette.background.ignoresSafeArea()
                        HStack(spacing: 0) {
                            Text(clock.base)
                                .font(.system(size: clock.added == nil ? 44 : 40, weight: .bold, design: .rounded))
                                .foregroundStyle(.white)
                            if let added = clock.added {
                                Text(added)
                                    .font(.system(size: 40, weight: .bold, design: .rounded))
                                    .foregroundStyle(WatchPalette.accent)
                            }
                        }
                        .lineLimit(1)
                        .minimumScaleFactor(0.6)
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                    }
                    .contentShape(Rectangle())
                }
            }
            .buttonStyle(.plain)
        } else {
            EmptySelection {
                viewModel.back()
            }
        }
    }
}

private struct TeamScorePickerScreen: View {
    @ObservedObject var viewModel: WatchOfficialViewModel

    var body: some View {
        if let match = viewModel.selectedMatch {
            ZStack {
                VStack(spacing: 0) {
                    TeamScorePanel(
                        team: match.team1,
                        fallback: "Home",
                        score: match.score(for: match.team1?.id),
                        isHome: true
                    ) {
                        if let teamId = match.team1?.id {
                            viewModel.selectTeam(teamId)
                        }
                    }
                    TeamScorePanel(
                        team: match.team2,
                        fallback: "Away",
                        score: match.score(for: match.team2?.id),
                        isHome: false
                    ) {
                        if let teamId = match.team2?.id {
                            viewModel.selectTeam(teamId)
                        }
                    }
                }
                CompactCenterAction {
                    viewModel.showActionMenu()
                }
            }
            .ignoresSafeArea()
            .task(id: match.id) {
                if viewModel.isDemo { return }
                try? await Task.sleep(nanoseconds: 5_000_000_000)
                await MainActor.run {
                    viewModel.returnToTimerIfTeamPicker()
                }
            }
        } else {
            EmptySelection {
                viewModel.back()
            }
        }
    }
}

private struct ActionMenuScreen: View {
    @ObservedObject var viewModel: WatchOfficialViewModel

    var body: some View {
        if let match = viewModel.selectedMatch {
            FixedFooterScreen(title: "Action", onBack: viewModel.back, footer: EmptyView()) {
                CompactButton(title: "Incidents") {
                    viewModel.showIncidentList()
                }
                CompactButton(title: "Reset Time", secondary: true) {
                    viewModel.resetTimer()
                }
                CompactButton(title: match.endSegmentActionLabel, color: WatchPalette.danger) {
                    viewModel.endSegment()
                }
                StatusBanner(message: viewModel.error, isError: true)
                StatusBanner(message: viewModel.message, isError: false)
            }
        } else {
            EmptySelection {
                viewModel.back()
            }
        }
    }
}

private struct IncidentListScreen: View {
    @ObservedObject var viewModel: WatchOfficialViewModel

    var body: some View {
        if let match = viewModel.selectedMatch {
            FixedFooterScreen(title: "Incidents", onBack: viewModel.back, footer: EmptyView()) {
                let incidents = match.raw.incidents.sorted { left, right in
                    (left.sequence, left.minute ?? 0) < (right.sequence, right.minute ?? 0)
                }
                if incidents.isEmpty {
                    EmptyText("No incidents")
                } else {
                    ForEach(incidents) { incident in
                        Button {
                            viewModel.openIncidentEditor(incident.resolvedId)
                        } label: {
                            IncidentRow(incident: incident, match: match)
                        }
                        .buttonStyle(.plain)
                    }
                }
                StatusBanner(message: viewModel.error, isError: true)
            }
        } else {
            EmptySelection {
                viewModel.back()
            }
        }
    }
}

private struct IncidentEditorScreen: View {
    @ObservedObject var viewModel: WatchOfficialViewModel

    var body: some View {
        if let match = viewModel.selectedMatch {
            FixedFooterScreen(
                title: viewModel.incidentMode == .edit ? "Edit incident" : "Add incident",
                onBack: viewModel.back,
                footer: footer
            ) {
                EditorFieldRow(label: "Type", value: viewModel.selectedIncidentType?.displayLabel ?? "Select") {
                    viewModel.editIncidentField(.type)
                }
                EditorFieldRow(label: "Team", value: viewModel.selectedTeam?.label ?? "Select") {
                    viewModel.editIncidentField(.team)
                }
                let type = viewModel.selectedIncidentType
                let playerValue: String = {
                    if type?.isScoring == true && type?.requiresPlayer(rules: match.rules) == false {
                        return "Not needed"
                    }
                    return viewModel.selectedPlayer?.playerLabel ?? "Select"
                }()
                EditorFieldRow(label: "Player", value: playerValue) {
                    viewModel.editIncidentField(.player)
                }
                EditorFieldRow(label: "Time", value: viewModel.incidentClockDisplay.plainLabel) {
                    viewModel.editIncidentField(.time)
                }
                StatusBanner(message: viewModel.error, isError: true)
            }
        } else {
            EmptySelection {
                viewModel.back()
            }
        }
    }

    private var footer: some View {
        HStack(spacing: 0) {
            FooterButton(title: "Cancel", color: WatchPalette.danger) {
                viewModel.cancelIncident()
            }
            FooterButton(title: viewModel.isLoading ? "Finished" : "Finish", color: WatchPalette.accent, darkForeground: true) {
                viewModel.finishIncident()
            }
        }
    }
}

private struct IncidentTypeScreen: View {
    @ObservedObject var viewModel: WatchOfficialViewModel

    var body: some View {
        if let match = viewModel.selectedMatch {
            FixedFooterScreen(
                title: "Type",
                onBack: viewModel.back,
                footer: cancelFooter
            ) {
                ForEach(match.rules.incidentTypes) { type in
                    let requiresPlayer = type.requiresPlayer(rules: match.rules)
                    let suffix = type.isScoring && !requiresPlayer
                        ? " +\(type.linkedPointDelta ?? 1)"
                        : (requiresPlayer ? " player" : "")
                    CompactButton(title: "\(type.displayLabel)\(suffix)", secondary: !type.isScoring) {
                        viewModel.selectIncident(type.code)
                    }
                }
                StatusBanner(message: viewModel.error, isError: true)
            }
        } else {
            EmptySelection {
                viewModel.back()
            }
        }
    }

    private var cancelFooter: some View {
        FooterButton(title: "Cancel", color: WatchPalette.danger) {
            viewModel.cancelIncident()
        }
    }
}

private struct IncidentTeamScreen: View {
    @ObservedObject var viewModel: WatchOfficialViewModel

    var body: some View {
        if let match = viewModel.selectedMatch {
            FixedFooterScreen(title: "Team", onBack: viewModel.back, footer: cancelFooter) {
                if let team = match.team1 {
                    TeamChip(team: team, score: match.score(for: team.id)) {
                        viewModel.selectTeam(team.id)
                    }
                }
                if let team = match.team2 {
                    TeamChip(team: team, score: match.score(for: team.id)) {
                        viewModel.selectTeam(team.id)
                    }
                }
                StatusBanner(message: viewModel.error, isError: true)
            }
        } else {
            EmptySelection {
                viewModel.back()
            }
        }
    }

    private var cancelFooter: some View {
        FooterButton(title: "Cancel", color: WatchPalette.danger) {
            viewModel.cancelIncident()
        }
    }
}

private struct PlayerScreen: View {
    @ObservedObject var viewModel: WatchOfficialViewModel

    var body: some View {
        if let match = viewModel.selectedMatch,
           let team = viewModel.selectedTeam,
           let type = viewModel.selectedIncidentType {
            FixedFooterScreen(title: "Player", onBack: viewModel.back, footer: cancelFooter) {
                ForEach(team.players) { player in
                    CompactButton(title: player.playerLabel, secondary: true) {
                        viewModel.selectPlayer(player.participantUserId)
                    }
                }
                if !type.requiresPlayer(rules: match.rules) {
                    CompactButton(title: "No player", secondary: true) {
                        viewModel.selectPlayer(nil)
                    }
                }
                StatusBanner(message: viewModel.error, isError: true)
            }
        } else {
            EmptySelection {
                viewModel.back()
            }
        }
    }

    private var cancelFooter: some View {
        FooterButton(title: "Cancel", color: WatchPalette.danger) {
            viewModel.cancelIncident()
        }
    }
}

private struct MinuteConfirmScreen: View {
    @ObservedObject var viewModel: WatchOfficialViewModel

    var body: some View {
        if let type = viewModel.selectedIncidentType {
            FixedFooterScreen(title: "Time", onBack: viewModel.back, footer: footer) {
                Text(type.displayLabel)
                    .font(.caption2)
                    .foregroundStyle(WatchPalette.muted)
                    .lineLimit(1)
                TimePicker(clock: viewModel.incidentClockDisplay) { delta in
                    viewModel.adjustMinute(delta)
                }
                StatusBanner(message: viewModel.error, isError: true)
            }
        } else {
            EmptySelection {
                viewModel.back()
            }
        }
    }

    private var footer: some View {
        HStack(spacing: 0) {
            FooterButton(title: "Cancel", color: WatchPalette.danger) {
                viewModel.cancelIncident()
            }
            FooterButton(title: "Done", color: WatchPalette.accent, darkForeground: true) {
                viewModel.returnToIncidentEditor()
            }
        }
    }
}

private struct ScrollScreen<Content: View>: View {
    var horizontalPadding: CGFloat = 10
    var verticalPadding: CGFloat = 8
    var spacing: CGFloat = 7
    @ViewBuilder let content: Content

    init(
        horizontalPadding: CGFloat = 10,
        verticalPadding: CGFloat = 8,
        spacing: CGFloat = 7,
        @ViewBuilder content: () -> Content
    ) {
        self.horizontalPadding = horizontalPadding
        self.verticalPadding = verticalPadding
        self.spacing = spacing
        self.content = content()
    }

    var body: some View {
        ScrollView {
            VStack(spacing: spacing) {
                content
            }
            .frame(maxWidth: .infinity)
            .padding(.horizontal, horizontalPadding)
            .padding(.vertical, verticalPadding)
        }
    }
}

private struct FixedFooterScreen<Content: View, Footer: View>: View {
    let title: String
    let onBack: () -> Void
    let footer: Footer
    @ViewBuilder let content: Content

    init(
        title: String,
        onBack: @escaping () -> Void,
        footer: Footer,
        @ViewBuilder content: () -> Content
    ) {
        self.title = title
        self.onBack = onBack
        self.footer = footer
        self.content = content()
    }

    var body: some View {
        VStack(spacing: 0) {
            TopBar(title: title, onBack: onBack)
                .padding(.horizontal, 10)
                .padding(.top, 4)
            ScrollView {
                VStack(spacing: 4) {
                    content
                }
                .padding(.horizontal, 10)
                .padding(.top, 4)
                .padding(.bottom, 2)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            footer
        }
        .ignoresSafeArea(edges: .bottom)
    }
}

private struct Header: View {
    let title: String
    let subtitle: String?

    var body: some View {
        VStack(spacing: 1) {
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

private struct TopBar: View {
    let title: String
    let onBack: () -> Void

    var body: some View {
        HStack(spacing: 8) {
            BackButton(onBack: onBack)
            Text(title)
                .font(.headline.weight(.bold))
                .lineLimit(1)
                .minimumScaleFactor(0.75)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
    }
}

private struct BackButton: View {
    let onBack: () -> Void

    var body: some View {
        Button(action: onBack) {
            Image(systemName: "chevron.left")
                .font(.caption.weight(.heavy))
                .frame(width: 28, height: 28)
                .background(WatchPalette.surfaceAlt, in: Circle())
        }
        .buttonStyle(.plain)
    }
}

private struct CompactButton: View {
    let title: String
    var secondary = false
    var color: Color?
    var enabled = true
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(title)
                .font(.caption.weight(.bold))
                .lineLimit(1)
                .minimumScaleFactor(0.68)
                .frame(maxWidth: .infinity, minHeight: 30)
                .padding(.horizontal, 8)
                .background(background, in: Capsule())
                .foregroundStyle(foreground)
        }
        .buttonStyle(.plain)
        .disabled(!enabled)
    }

    private var background: Color {
        if !enabled {
            return WatchPalette.surfaceAlt.opacity(0.6)
        }
        return color ?? (secondary ? WatchPalette.surfaceAlt : WatchPalette.accent)
    }

    private var foreground: Color {
        if !enabled {
            return WatchPalette.muted
        }
        if color != nil {
            return .white
        }
        return secondary ? .white : Color(red: 0.02, green: 0.14, blue: 0.06)
    }
}

private struct FooterButton: View {
    let title: String
    let color: Color
    var darkForeground = false
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(title)
                .font(.caption.weight(.bold))
                .lineLimit(1)
                .minimumScaleFactor(0.7)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .foregroundStyle(darkForeground ? Color(red: 0.02, green: 0.14, blue: 0.06) : .white)
        }
        .buttonStyle(.plain)
        .frame(maxWidth: .infinity)
        .frame(height: 26)
        .background(color)
        .clipped()
    }
}

private struct MatchRow: View {
    let match: WatchMatch

    var body: some View {
        HStack(spacing: 7) {
            Text(match.numberLabel)
                .font(.caption.weight(.bold))
                .foregroundStyle(WatchPalette.accent)
                .frame(width: 30, height: 30)
                .background(WatchPalette.surfaceAlt, in: Circle())
            VStack(alignment: .leading, spacing: 1) {
                Text(match.shortTeamLabel)
                    .font(.caption.weight(.semibold))
                    .lineLimit(1)
                Text(match.timeAndFieldLabel)
                    .font(.caption2)
                    .foregroundStyle(WatchPalette.muted)
                    .lineLimit(1)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(.horizontal, 9)
        .padding(.vertical, 7)
        .background(WatchPalette.surface, in: RoundedRectangle(cornerRadius: 9))
    }
}

private struct TeamScorePanel: View {
    let team: WatchTeam?
    let fallback: String
    let score: Int
    let isHome: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            VStack(spacing: 2) {
                if !isHome {
                    ScoreText(score: score)
                }
                HStack(spacing: 8) {
                    TeamBadge(label: team?.label ?? fallback)
                    Text(team?.label ?? fallback)
                        .font(.headline.weight(.bold))
                        .lineLimit(1)
                        .minimumScaleFactor(0.6)
                }
                if isHome {
                    ScoreText(score: score)
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .padding(.horizontal, 20)
            .padding(.top, isHome ? 6 : 0)
            .padding(.bottom, isHome ? 0 : 10)
            .background(isHome ? WatchPalette.home : WatchPalette.away)
            .foregroundStyle(.white)
        }
        .buttonStyle(.plain)
    }
}

private struct ScoreText: View {
    let score: Int

    var body: some View {
        Text("\(score)")
            .font(.system(size: 34, weight: .bold, design: .rounded))
            .lineLimit(1)
            .minimumScaleFactor(0.75)
    }
}

private struct TeamBadge: View {
    let label: String

    var body: some View {
        Text(label.first.map { String($0).uppercased() } ?? "?")
            .font(.caption.weight(.bold))
            .frame(width: 25, height: 25)
            .background(.white.opacity(0.15), in: Circle())
    }
}

private struct CompactCenterAction: View {
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 7) {
                Image(systemName: "plus.circle.fill")
                    .font(.title3)
                Text("Action")
                    .font(.caption.weight(.bold))
                    .lineLimit(1)
            }
            .foregroundStyle(WatchPalette.home)
            .frame(maxWidth: 118, minHeight: 32)
            .background(Color.white.opacity(0.94), in: Capsule())
        }
        .buttonStyle(.plain)
    }
}

private struct TeamChip: View {
    let team: WatchTeam
    let score: Int
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 8) {
                Text("\(score)")
                    .font(.headline.weight(.bold))
                    .foregroundStyle(WatchPalette.accent)
                    .frame(width: 24)
                Text(team.label)
                    .font(.caption.weight(.semibold))
                    .lineLimit(1)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            .padding(.horizontal, 10)
            .frame(maxWidth: .infinity, minHeight: 32)
            .background(WatchPalette.surfaceAlt, in: Capsule())
        }
        .buttonStyle(.plain)
    }
}

private struct IncidentRow: View {
    let incident: WatchMatchIncidentDTO
    let match: WatchMatch

    var body: some View {
        let team = match.team(for: incident.eventTeamId)
        let player = team?.players.first { $0.participantUserId == incident.participantUserId }
        let clock = match.incidentListClockDisplay(for: incident)
        HStack(spacing: 7) {
            HStack(spacing: 0) {
                Text(clock.base)
                    .foregroundStyle(.white)
                if let added = clock.added {
                    Text(added)
                        .foregroundStyle(WatchPalette.accent)
                }
            }
            .font(.caption2.weight(.bold))
            .lineLimit(1)
            .minimumScaleFactor(0.75)
            .frame(width: 42, alignment: .leading)
            VStack(alignment: .leading, spacing: 1) {
                Text(incident.typeLabel(match: match))
                    .font(.caption.weight(.bold))
                    .lineLimit(1)
                Text([team?.label, player?.label].compactMap { $0 }.joined(separator: " - ").ifEmpty("No details"))
                    .font(.caption2)
                    .foregroundStyle(WatchPalette.muted)
                    .lineLimit(1)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(.horizontal, 9)
        .padding(.vertical, 7)
        .background(WatchPalette.surface, in: RoundedRectangle(cornerRadius: 9))
    }
}

private struct EditorFieldRow: View {
    let label: String
    let value: String
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 6) {
                Text(label)
                    .font(.caption2.weight(.bold))
                    .foregroundStyle(WatchPalette.muted)
                Text(value)
                    .font(.caption.weight(.semibold))
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
                    .frame(maxWidth: .infinity, alignment: .trailing)
            }
            .padding(.horizontal, 10)
            .frame(maxWidth: .infinity, minHeight: 23)
            .background(WatchPalette.surface, in: Capsule())
        }
        .buttonStyle(.plain)
    }
}

private struct TimePicker: View {
    let clock: IncidentClockDisplay
    let onAdjust: (Int) -> Void

    var body: some View {
        HStack(spacing: 8) {
            RoundControl(title: "-") {
                onAdjust(-1)
            }
            VStack(spacing: 0) {
                HStack(spacing: 0) {
                    Text(clock.base)
                        .font(.system(size: 30, weight: .bold, design: .rounded))
                    if let added = clock.added {
                        Text(added)
                            .font(.system(size: 30, weight: .bold, design: .rounded))
                            .foregroundStyle(WatchPalette.accent)
                    }
                }
                Text("minutes")
                    .font(.caption2)
                    .foregroundStyle(WatchPalette.muted)
            }
            .frame(maxWidth: .infinity, minHeight: 58)
            .background(WatchPalette.surfaceAlt, in: RoundedRectangle(cornerRadius: 12))
            RoundControl(title: "+") {
                onAdjust(1)
            }
        }
    }
}

private struct RoundControl: View {
    let title: String
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(title)
                .font(.title3.weight(.bold))
                .frame(width: 38, height: 38)
                .background(WatchPalette.surface, in: Circle())
        }
        .buttonStyle(.plain)
    }
}

private struct EmptyText: View {
    let text: String

    init(_ text: String) {
        self.text = text
    }

    var body: some View {
        Text(text)
            .font(.caption)
            .foregroundStyle(WatchPalette.muted)
            .multilineTextAlignment(.center)
            .frame(maxWidth: .infinity, minHeight: 42)
            .background(WatchPalette.surface, in: RoundedRectangle(cornerRadius: 10))
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
                .padding(.horizontal, 7)
                .padding(.vertical, 5)
                .frame(maxWidth: .infinity)
                .background((isError ? WatchPalette.danger : WatchPalette.accent).opacity(0.16), in: RoundedRectangle(cornerRadius: 8))
        }
    }
}

private struct EmptySelection: View {
    let onBack: () -> Void

    var body: some View {
        VStack(spacing: 8) {
            EmptyText("Nothing selected")
            CompactButton(title: "Back") {
                onBack()
            }
        }
        .padding(12)
    }
}

private extension View {
    func watchFieldStyle() -> some View {
        self
            .font(.caption)
            .padding(.horizontal, 9)
            .frame(minHeight: 34)
            .background(WatchPalette.surface, in: RoundedRectangle(cornerRadius: 9))
    }
}

private struct MatchClockDisplay {
    let base: String
    let added: String?
}

private struct IncidentClockDisplay {
    let base: String
    let added: String?

    var plainLabel: String {
        base + (added ?? "")
    }
}

private extension WatchOfficialViewModel {
    var incidentClockDisplay: IncidentClockDisplay {
        guard let match = selectedMatch else {
            return IncidentClockDisplay(base: incidentMinute.minuteLabel, added: nil)
        }
        let segment = selectedIncident?.segmentId.trimmedOrNil.flatMap { segmentId in
            match.raw.segments.first { $0.resolvedId == segmentId }
        } ?? match.raw.activeSegment ?? match.raw.nextPlayableSegment(rules: match.rules)
        return match.incidentClockDisplay(
            segment: segment,
            seconds: incidentClockSeconds,
            fallbackMinute: incidentMinute
        )
    }
}

private extension WatchMatch {
    var numberLabel: String {
        number > 0 ? "\(number)" : "-"
    }

    var teamLabel: String {
        "\(team1?.label ?? "TBD") vs \(team2?.label ?? "TBD")"
    }

    var shortTeamLabel: String {
        "\(team1?.shortLabel ?? "TBD") vs \(team2?.shortLabel ?? "TBD")"
    }

    var timeAndFieldLabel: String {
        [startIso?.formattedStartTime, fieldLabel]
            .compactMap { $0 }
            .joined(separator: " - ")
            .trimmedOrNil ?? division ?? "Upcoming"
    }

    var isFinished: Bool {
        status?.uppercased() == "COMPLETE" || raw.actualEnd.trimmedOrNil != nil
    }

    var canStartSegmentFromDetail: Bool {
        raw.activeSegment == nil &&
            (raw.nextPlayableSegment(rules: rules) != nil || raw.nextPlayableSequence(rules: rules) != nil || shouldOfferFinishAndStart)
    }

    var shouldOfferFinishAndStart: Bool {
        raw.activeSegment == nil && regulationComplete && isTiedForContinuation && canUseTieBreaker
    }

    var startSegmentActionLabel: String {
        "Start \(nextStartUnitLabel)"
    }

    var endSegmentActionLabel: String {
        let active = raw.activeSegment
        let regulationCount = max(1, rules.segmentCount)
        let unit = active != nil && active!.sequence > regulationCount ? "Overtime" : segmentUnitLabel
        return "End \(unit)"
    }

    func score(for teamId: String?) -> Int {
        guard let teamId else { return 0 }
        return raw.orderedSegments.reduce(0) { total, segment in
            total + (segment.scores[teamId] ?? 0)
        }
    }

    func team(for teamId: String?) -> WatchTeam? {
        [team1, team2].compactMap { $0 }.first { $0.id == teamId }
    }

    func clockDisplay(now: Date) -> MatchClockDisplay {
        guard let active = raw.activeSegment else {
            return MatchClockDisplay(base: formatDuration(0), added: nil)
        }
        let elapsedSeconds = active.elapsedSeconds(now: now)
        guard rules.timekeeping.addedTimeEnabled,
              let durationSeconds = durationSeconds(forSequence: active.sequence) else {
            return MatchClockDisplay(base: formatDuration(elapsedSeconds), added: nil)
        }
        let offsetSeconds = regulationOffsetSeconds(for: active)
        if elapsedSeconds >= durationSeconds {
            return MatchClockDisplay(base: "", added: "+\(formatDuration(elapsedSeconds - durationSeconds))")
        }
        return MatchClockDisplay(base: formatDuration(offsetSeconds + elapsedSeconds), added: nil)
    }

    func incidentClockDisplay(
        segment: WatchMatchSegmentDTO?,
        seconds: Int,
        fallbackMinute: Int
    ) -> IncidentClockDisplay {
        let safeSeconds = max(0, seconds)
        guard rules.timekeeping.addedTimeEnabled, let segment else {
            return IncidentClockDisplay(base: fallbackMinute.minuteLabel, added: nil)
        }
        guard let durationSeconds = durationSeconds(forSequence: segment.sequence) else {
            return IncidentClockDisplay(base: fallbackMinute.minuteLabel, added: nil)
        }
        let regulationEndSeconds = regulationOffsetSeconds(for: segment) + durationSeconds
        if safeSeconds >= regulationEndSeconds {
            let regulationMinute = max(0, regulationEndSeconds / 60)
            let addedMinute = (max(0, safeSeconds - regulationEndSeconds) / 60) + 1
            return IncidentClockDisplay(base: "\(regulationMinute)", added: "+\(addedMinute)")
        }
        return IncidentClockDisplay(base: fallbackMinute.minuteLabel, added: nil)
    }

    func incidentListClockDisplay(for incident: WatchMatchIncidentDTO) -> IncidentClockDisplay {
        let fallbackMinute = max(1, incident.minute ?? 1)
        let seconds = incident.clockSeconds ?? incidentSeconds(forMinute: fallbackMinute)
        let segment = incident.segmentId.trimmedOrNil.flatMap { segmentId in
            raw.segments.first { $0.resolvedId == segmentId }
        } ?? raw.activeSegment ?? raw.nextPlayableSegment(rules: rules)
        return incidentClockDisplay(segment: segment, seconds: seconds, fallbackMinute: fallbackMinute)
    }

    private var regulationComplete: Bool {
        let regulationCount = max(1, rules.segmentCount)
        return (1...regulationCount).allSatisfy { sequence in
            raw.orderedSegments.first { $0.sequence == sequence }?.status.uppercased() == "COMPLETE"
        }
    }

    private var isTiedForContinuation: Bool {
        guard let team1Id = team1?.id, let team2Id = team2?.id else {
            return false
        }
        return score(for: team1Id) == score(for: team2Id)
    }

    private var canUseTieBreaker: Bool {
        !rules.supportsDraw &&
            (rules.supportsOvertime || rules.canUseOvertime || rules.supportsShootout || rules.canUseShootout)
    }

    private var nextStartUnitLabel: String {
        let regulationCount = max(1, rules.segmentCount)
        let sequence = raw.nextPlayableSegment(rules: rules)?.sequence
            ?? raw.nextPlayableSequence(rules: rules)
            ?? ((raw.segments.map(\.sequence).max() ?? regulationCount) + 1)
        if sequence <= regulationCount {
            return regulationStartLabel(sequence: sequence)
        }
        if rules.supportsOvertime || rules.canUseOvertime {
            let overtimeSequence = sequence - regulationCount
            return overtimeSequence <= 1 ? "Overtime" : "Overtime \(overtimeSequence)"
        }
        if rules.supportsShootout || rules.canUseShootout {
            return "Penalties"
        }
        return segmentUnitLabel
    }

    private func regulationStartLabel(sequence: Int) -> String {
        let unit = segmentUnitLabel
        if unit.caseInsensitiveCompare("Half") == .orderedSame {
            switch sequence {
            case 1:
                return "First Half"
            case 2:
                return "Second Half"
            default:
                return "Half \(sequence)"
            }
        }
        return "\(unit) \(sequence)"
    }

    private var segmentUnitLabel: String {
        let label = rules.segmentLabel.trimmedOrNil ?? "Segment"
        let normalized = label.lowercased()
        if normalized == "total" || normalized == "match" || normalized == "game" {
            return "Segment"
        }
        return label
    }

    private func durationSeconds(forSequence sequence: Int) -> Int? {
        let durationMinutes = rules.timekeeping.segmentDurationMinutesBySequence[safe: sequence - 1]
            ?? rules.timekeeping.segmentDurationMinutes
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

private extension WatchMatchIncidentDTO {
    func typeLabel(match: WatchMatch) -> String {
        match.rules.incidentTypes.first { $0.code == incidentType }?.displayLabel ?? incidentType.readableCodeLabel
    }
}

private extension WatchTeam {
    var shortLabel: String {
        if label.count <= 12 {
            return label
        }
        let tokens = label
            .split { $0 == " " || $0 == "-" || $0 == "/" }
            .map(String.init)
            .filter { !$0.isEmpty }
        if tokens.count >= 2 {
            return tokens.prefix(2).map { String($0.prefix(5)) }.joined(separator: " ")
        }
        return String(label.prefix(12))
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
        formatter.dateFormat = "EEE h:mm a"
        return formatter.string(from: date)
    }

    func ifEmpty(_ fallback: String) -> String {
        isEmpty ? fallback : self
    }
}

private extension Int {
    var minuteLabel: String {
        "\(Swift.max(1, self))".leftPadded(toLength: 2, withPad: "0")
    }
}

private extension Collection {
    subscript(safe index: Index) -> Element? {
        indices.contains(index) ? self[index] : nil
    }
}

private func formatDuration(_ seconds: Int) -> String {
    let safeSeconds = max(0, seconds)
    let minutes = safeSeconds / 60
    let remainder = safeSeconds % 60
    return "\(minutes)".leftPadded(toLength: 3, withPad: "0") + ":" + "\(remainder)".leftPadded(toLength: 2, withPad: "0")
}

private func incidentSeconds(forMinute minute: Int) -> Int {
    (max(1, minute) - 1) * 60
}

private extension String {
    func leftPadded(toLength length: Int, withPad pad: Character) -> String {
        if count >= length {
            return self
        }
        return String(repeating: String(pad), count: length - count) + self
    }
}
