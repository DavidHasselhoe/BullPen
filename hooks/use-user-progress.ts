'use client';

import { useQuery } from '@tanstack/react-query';
import type { Course, CourseWithProgress, LessonWithCompletion } from '@/types/academy';

interface CoursesResponse {
  success: boolean;
  courses: CourseWithProgress[];
}

interface CourseResponse {
  success: boolean;
  course: Course;
  lessons: LessonWithCompletion[];
  progress: {
    last_lesson_id: string | null;
    completed_at: string | null;
    started_at: string;
  } | null;
}

/** Course catalog with the current user's per-course progress + locked state. */
export function useAcademyCourses() {
  return useQuery<CourseWithProgress[]>({
    queryKey: ['academy-courses'],
    queryFn: async () => {
      const res = await fetch('/api/academy/courses');
      if (!res.ok) throw new Error('Failed to load courses');
      const data: CoursesResponse = await res.json();
      return data.courses;
    },
    staleTime: 60 * 1000,
  });
}

/** A single course with its lessons + per-lesson completion flags. */
export function useUserProgress(courseSlug: string | null) {
  return useQuery<CourseResponse>({
    queryKey: ['academy-progress', courseSlug],
    queryFn: async () => {
      const res = await fetch(`/api/academy/courses/${courseSlug}`);
      if (!res.ok) throw new Error('Failed to load course');
      return res.json();
    },
    enabled: !!courseSlug,
    staleTime: 30 * 1000,
  });
}
