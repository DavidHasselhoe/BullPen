/**
 * A screen where the learner is inside a lesson or a course's final quiz:
 * /academy/<course>/<lesson>. These run with the global chrome stepped back,
 * the way a lesson game does: no sticky XP bar (the lesson shows its own
 * progress and the reward screen its own level bar) and no floating Ask Bull
 * button, which covered the fourth answer option on a phone. Term popovers
 * still open Bull directly.
 */
export function isAcademyLessonRoute(pathname: string | null): boolean {
  return !!pathname && /^\/academy\/[^/]+\/[^/]+\/?$/.test(pathname) && !pathname.startsWith('/academy/leaderboard/');
}
