import React from 'react'
import { Composition } from 'remotion'
import {
  COURSE_VIDEO_FPS,
  COURSE_VIDEO_HEIGHT,
  COURSE_VIDEO_WIDTH,
  CourseVideo,
  EMPTY_COURSE_VIDEO_PROPS,
  courseVideoDurationInFrames,
  type CourseVideoRenderProps,
} from './CourseVideo'

export function RemotionRoot() {
  return (
    <Composition
      id="CourseVideo"
      component={CourseVideo}
      width={COURSE_VIDEO_WIDTH}
      height={COURSE_VIDEO_HEIGHT}
      fps={COURSE_VIDEO_FPS}
      durationInFrames={courseVideoDurationInFrames(EMPTY_COURSE_VIDEO_PROPS)}
      defaultProps={EMPTY_COURSE_VIDEO_PROPS}
      calculateMetadata={({ props }) => ({
        durationInFrames: courseVideoDurationInFrames(props),
        props,
      })}
    />
  )
}
