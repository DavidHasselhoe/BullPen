import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import i18next from "eslint-plugin-i18next";

/**
 * i18n lint ratchet (see the i18n effort plan, Phase 2b). `i18next/no-literal-string`
 * flags a hardcoded JSX text string — but it's only turned on for directories
 * that have ALREADY been through the Phase 1 codemod + review pass and verified
 * to have zero hardcoded strings. Enabling it repo-wide would just flag the
 * ~2,000 strings still awaiting conversion; scoped like this, it instead makes
 * a REGRESSION in an already-converted area impossible without failing the
 * lint gate that already runs every session — no ongoing discipline required.
 *
 * Add a directory's glob here the same PR its Phase 1 conversion completes.
 * Empty for now — nothing has been fully converted yet.
 */
const I18N_DONE_DIRS = ["app/tools/ai-chat/**/*.tsx", "app/tools/portfolio-builder/**/*.tsx", "app/tools/buy-here/**/*.tsx", "app/tools/market-mood/**/*.tsx", "app/tools/dividend/**/*.tsx", "app/tools/heatmap/**/*.tsx", "app/tools/alerts/**/*.tsx", "app/tools/calendar/**/*.tsx", "app/tools/page.tsx", "app/tools/[tool]/**/*.tsx", "app/tools/deep-dive/**/*.tsx", "app/tools/screener/page.tsx", "app/tools/compare/**/*.tsx", "components/tools/buy-here/**/*.tsx", "components/tools/calendar/**/*.tsx", "components/tools/compare/**/*.tsx", "components/tools/portfolio-builder/**/*.tsx", "components/tools/DividendPresetMenu.tsx", "components/screener/**/*.tsx", "components/stock/StockSectionBoundary.tsx", "components/stock/ExperienceOnboardingBanner.tsx", "components/stock/VolatilityGauge.tsx", "components/stock/CompetitorsCard.tsx", "components/stock/StockNavSidebar.tsx", "components/stock/CompanyProfileCard.tsx", "components/stock/ChartSettingsPanel.tsx", "components/stock/advanced-chart/PresetMenu.tsx", "components/stock/HealthScoreHistoryModal.tsx", "components/stock/advanced-chart/IndicatorMenu.tsx", "components/stock/EarningsCalendar.tsx", "components/stock/ChartPrefsControls.tsx", "components/stock/advanced-chart/ChartToolbar.tsx", "components/stock/InsiderTransactionsCard.tsx", "components/stock/advanced-chart/AdvancedChartModal.tsx", "components/stock/HealthScoreCard.tsx", "components/stock/advanced-chart/ChartAIPanel.tsx", "components/stock/SankeyCard.tsx", "components/stock/FinancialsTrendChart.tsx", "components/stock/FinancialsSection.tsx", "components/stock/StatisticsGrid.tsx", "components/stock/advanced-chart/AdvancedChart.tsx", "components/stock/StockPricePanel.tsx", "components/holdings/DeleteHoldingDialog.tsx", "components/holdings/ShareSheet.tsx", "components/holdings/SoldPositionsModal.tsx", "components/holdings/AddPurchaseModal.tsx", "components/holdings/SellHoldingModal.tsx", "components/holdings/HoldingsTable.tsx", "components/holdings/EditHoldingModal.tsx", "components/holdings/HoldingsPieChart.tsx", "components/holdings/CSVImportModal.tsx", "components/holdings/risk-analysis/Recommendations.tsx", "components/holdings/risk-analysis/TopRisks.tsx", "components/holdings/risk-analysis/SectorExposure.tsx", "components/holdings/risk-analysis/RiskProfile.tsx", "components/holdings/risk-analysis/StressScenarios.tsx", "components/holdings/risk-analysis/AIAssessment.tsx", "components/holdings/risk-analysis/AnalysisHistory.tsx", "components/holdings/risk-analysis/RiskScoreHero.tsx", "components/holdings/risk-analysis/RiskAnalysisResult.tsx", "components/holdings/performance-calendar/PerformanceCalendarCard.tsx", "components/holdings/performance-calendar/DayContributors.tsx", "components/holdings/performance-calendar/PerformanceHeatStrip.tsx", "components/holdings/performance-calendar/DayCell.tsx", "components/holdings/performance-calendar/CalendarGrid.tsx", "components/holdings/performance-calendar/PerformanceCalendar.tsx", "components/holdings/PortfolioDashboard.tsx", "components/holdings/PortfolioRiskAnalysis.tsx", "components/holdings/AddHoldingModal.tsx", "components/holdings/PortfolioPerformanceChart.tsx", "components/user/PublicHoldingsList.tsx", "components/user/FollowButton.tsx", "components/user/PublicProfileCard.tsx", "components/user/ActivityFeed.tsx", "components/user/ProfileAvatar.tsx", "components/user/ProfileModal.tsx", "components/user/SettingsModal.tsx", "components/ai/cards/CardPrimitives.tsx", "components/ai/BullAiIcon.tsx", "components/ai/cards/EarningsResultCard.tsx", "components/ai/cards/CompanyMetricsResultCard.tsx", "components/ai/cards/CompanyProfileResultCard.tsx", "components/ai/cards/LiveQuoteResultCard.tsx", "components/ai/cards/CompanyFinancialsResultCard.tsx", "components/ai/cards/HealthScoreResultCard.tsx", "components/ai/cards/KeyStatisticsResultCard.tsx", "components/ai/cards/InsiderActivityResultCard.tsx", "components/ai/cards/ComparisonResultCard.tsx", "components/ai/AIPanelToggle.tsx", "components/ai/AiTermsGate.tsx", "components/ai/cards/ActionReceiptCard.tsx", "components/ai/ToolResultCard.tsx", "components/ai/WhyTodayView.tsx", "components/ai/AIPanelProvider.tsx", "components/ai/AISidePanel.tsx", "components/ai/BullpenChat.tsx", "components/discover/v2/LivePriceContext.tsx", "components/discover/v2/DiscoverHeader.tsx", "components/discover/v2/MarketPulse.tsx", "components/discover/v2/CollectionGrid.tsx", "components/discover/PerformanceCalendarWidget.tsx", "components/discover/CompanyRowActions.tsx", "components/discover/RecentlyViewedCard.tsx", "components/discover/RecentlyViewedInline.tsx", "components/discover/v2/IdeaCollections.tsx", "components/discover/v2/CollectionFAQ.tsx", "components/discover/v2/IndexStrip.tsx", "components/discover/v2/MoodCompact.tsx", "components/discover/v2/SectorPerformance.tsx", "components/discover/v2/DiscoverClient.tsx", "components/discover/v2/TickerCard.tsx", "components/discover/WhyTodayWidget.tsx", "components/discover/HotPicksCard.tsx", "components/discover/v2/SectorRow.tsx", "components/discover/PortfolioSummaryWidget.tsx", "components/discover/EarningsCalendarWidget.tsx", "components/discover/DailyBriefWidget.tsx", "components/market/MarketCountdown.tsx", "components/market/ToolPicker.tsx", "components/market/MarketNewsCard.tsx", "components/market/ToolsShortcutCard.tsx", "components/market/ExchangePicker.tsx", "components/market/MarketMoodDisplay.tsx", "components/market/MarketContextSection.tsx", "components/market/MarketHoursCard.tsx", "components/market/TopMoversCard.tsx", "components/auth/AuthProvider.tsx", "components/auth/PasswordInput.tsx", "components/auth/AuthOAuthButtons.tsx", "components/auth/AuthFormForgotPassword.tsx", "components/auth/AuthFormLogin.tsx", "components/auth/AuthFormSignup.tsx", "components/auth/AuthModal.tsx", "components/academy/CourseIcon.tsx", "components/academy/LevelBadge.tsx", "components/academy/path/ChapterBanner.tsx", "components/academy/path/ComingSoonNode.tsx", "components/academy/lessons/demo/DividendDemo.tsx", "components/academy/lessons/demo/StockStatsDemo.tsx", "components/academy/StreakBadge.tsx", "components/academy/lessons/demo/MarketMoodDemo.tsx", "components/academy/lessons/demo/PortfolioDemo.tsx", "components/academy/lessons/demo/DemoSurfaceShell.tsx", "components/academy/XPBar.tsx", "components/academy/lessons/ScenarioLesson.tsx", "components/academy/lessons/DemoLesson.tsx", "components/academy/CompletionCelebration.tsx", "components/academy/lessons/ChartTourLesson.tsx", "components/academy/lessons/ReadLesson.tsx", "components/academy/lessons/demo/ScreenerDemo.tsx", "components/academy/lessons/QuizLesson.tsx", "components/academy/lessons/MatchLesson.tsx", "components/academy/path/PathNode.tsx", "components/academy/lessons/demo/AiResearchDemo.tsx", "components/academy/lessons/CourseChartTour.tsx", "components/academy/lessons/DemoTour.tsx", "components/academy/CourseFinalQuiz.tsx", "components/academy/path/AcademyPath.tsx", "components/academy/LessonPlayer.tsx", "components/academy/DailyChallengeCard.tsx", "app/academy/layout.tsx", "app/academy/[courseSlug]/layout.tsx", "app/academy/[courseSlug]/[lessonSlug]/layout.tsx", "app/academy/[courseSlug]/[lessonSlug]/page.tsx", "app/academy/[courseSlug]/quiz/page.tsx", "app/academy/complete/page.tsx", "app/academy/page.tsx", "app/academy/leaderboard/page.tsx", "app/academy/[courseSlug]/page.tsx", "components/billing/ProBadge.tsx", "components/billing/UpgradeCTA.tsx", "components/billing/ProGate.tsx", "components/billing/AskBullPaywallPreview.tsx", "components/billing/WhyTodayPaywallPreview.tsx", "components/billing/PortfolioBuilderPaywallPreview.tsx", "components/billing/DeepDivePaywallPreview.tsx", "components/billing/RiskAnalysisPaywallPreview.tsx", "components/billing/QuotaIndicator.tsx", "components/billing/paywall-config.tsx", "components/billing/AiPaywallDialog.tsx", "components/billing/AiPaywallContent.tsx", "components/billing/UpgradeSuccessModal.tsx", "app/upgrade/page.tsx", "app/pricing/page.tsx"];

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  ...(I18N_DONE_DIRS.length > 0
    ? [
        {
          files: I18N_DONE_DIRS,
          plugins: { i18next },
          rules: {
            "i18next/no-literal-string": ["error", { mode: "jsx-text-only" }],
          },
        },
      ]
    : []),
  {
    // Respect the codebase's existing `_`-prefix convention for intentionally
    // unused handler params (e.g. `_session`, `_ctx`) instead of flagging them.
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Harness scratch space (agent worktrees) — never lint their build artifacts.
    ".claude/**",
    "**/.next/**",
    // Compiled Vercel output — not source
    ".vercel/**",
    // Vendored from Bklit UI (components.json @bklit registry) — third-party
    // source we don't author, trips react-hooks/refs and set-state-in-effect
    // in its own internals.
    "components/charts/**",
    // AI-tool skill/agent config directories (Claude Code, Cursor, GitHub
    // Copilot) — vendored skill bundles like impeccable's minified scripts,
    // not application source. Same rationale as components/charts/** above.
    ".agents/**",
    ".cursor/**",
    ".github/skills/**",
    ".github/agents/**",
    ".github/hooks/**",
  ]),
]);

export default eslintConfig;
