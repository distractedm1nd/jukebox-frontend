import React, { useState, useEffect, useRef, memo } from "react";

const extractVideoId = (url) => {
  if (!url) return null;
  try {
    const videoUrl = typeof url === "object" ? url[0] : url;
    const urlPatterns = [
      /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i,
    ];

    for (const pattern of urlPatterns) {
      const match = videoUrl.match(pattern);
      if (match && match[1]) {
        return match[1];
      }
    }

    console.error("Could not extract video ID from URL:", videoUrl);
    return null;
  } catch (error) {
    console.error("Error extracting video ID:", error);
    return null;
  }
};

// Custom hook for YouTube API loading
const useYouTubeAPI = () => {
  const [isAPIReady, setIsAPIReady] = useState(false);

  useEffect(() => {
    if (window.YT) {
      setIsAPIReady(true);
      return;
    }

    const tag = document.createElement("script");
    tag.src = "https://www.youtube.com/iframe_api";
    const firstScriptTag = document.getElementsByTagName("script")[0];
    firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);

    window.onYouTubeIframeAPIReady = () => {
      setIsAPIReady(true);
    };
  }, []);

  return isAPIReady;
};

const YouTubePlayer = memo(
  ({ currentSong, onEnded }) => {
    const playerRef = useRef(null);
    const currentVideoIdRef = useRef(null);
    const [error, setError] = useState(null);
    const isAPIReady = useYouTubeAPI();
    const containerRef = useRef(null);

    const calculateStartTime = (startTimeObj) => {
      if (!startTimeObj?.secs_since_epoch) return 0;

      const startTime = new Date(startTimeObj.secs_since_epoch * 1000);
      const currentTime = new Date();
      const diffSeconds = Math.floor((currentTime - startTime) / 1000);

      // If negative, the song hasn't started yet
      if (diffSeconds < 0) {
        return 0;
      }

      // If we're past the song duration, skip to next
      if (
        currentSong?.duration?.secs &&
        diffSeconds > currentSong.duration.secs
      ) {
        if (onEnded) onEnded();
        return 0;
      }

      return diffSeconds;
    };

    useEffect(() => {
      if (!isAPIReady) return;

      const videoId = currentSong ? extractVideoId(currentSong.link) : null;
      const container = containerRef.current;
      const containerWidth = container?.clientWidth || 640;

      if (videoId) {
        if (!playerRef.current) {
          try {
            // Calculate start time when first loading the video
            const startSeconds = calculateStartTime(currentSong.start_time);

            playerRef.current = new window.YT.Player("youtube-player", {
              width: containerWidth,
              height: containerWidth * (9 / 16),
              videoId: videoId,
              playerVars: {
                autoplay: 1,
                controls: 1,
                rel: 0,
                modestbranding: 1,
                start: startSeconds, // Start at the correct time
                iv_load_policy: 3,
              },
              events: {
                onReady: (event) => {
                  // Double-check the time once player is ready
                  const currentSeconds = calculateStartTime(
                    currentSong.start_time,
                  );
                  if (currentSeconds > 0) {
                    event.target.seekTo(currentSeconds, true);
                  }
                },
                onStateChange: (event) => {
                  if (event.data === window.YT.PlayerState.ENDED && onEnded) {
                    onEnded();
                  }
                  // Ensure correct playback position when video starts playing
                  if (event.data === window.YT.PlayerState.PLAYING) {
                    const currentSeconds = calculateStartTime(
                      currentSong.start_time,
                    );
                    const playerTime = Math.floor(
                      event.target.getCurrentTime(),
                    );
                    if (Math.abs(currentSeconds - playerTime) > 2) {
                      event.target.seekTo(currentSeconds, true);
                    }
                  }
                },
                onError: (event) => {
                  setError(`Player error: ${event.data}`);
                  console.error("YouTube player error:", event);
                  if (onEnded) onEnded();
                },
              },
            });
            currentVideoIdRef.current = videoId;
          } catch (error) {
            console.error("Error initializing player:", error);
            setError("Failed to initialize player");
          }
        } else if (currentVideoIdRef.current !== videoId) {
          try {
            // Calculate start time when loading a new video
            const startSeconds = calculateStartTime(currentSong.start_time);

            playerRef.current.loadVideoById({
              videoId: videoId,
              startSeconds: startSeconds,
            });
            currentVideoIdRef.current = videoId;
            setError(null);
          } catch (error) {
            console.error("Error loading video:", error);
            setError("Failed to load video");
          }
        } else {
          // Check if we need to update the current time for the same video
          const currentSeconds = calculateStartTime(currentSong.start_time);
          const playerTime = Math.floor(playerRef.current.getCurrentTime());
          if (Math.abs(currentSeconds - playerTime) > 2) {
            playerRef.current.seekTo(currentSeconds, true);
          }
        }
      }

      // Interval to check if we need to skip to next song
      const timeCheckInterval = setInterval(() => {
        if (
          currentSong?.duration?.secs &&
          currentSong?.start_time?.secs_since_epoch
        ) {
          const startTime = new Date(
            currentSong.start_time.secs_since_epoch * 1000,
          );
          const currentTime = new Date();
          const diffSeconds = Math.floor((currentTime - startTime) / 1000);

          if (diffSeconds > currentSong.duration.secs) {
            if (onEnded) onEnded();
          }
        }
      }, 1000);

      // Handle window resize
      const handleResize = () => {
        if (playerRef.current && container) {
          const newWidth = container.clientWidth;
          const newHeight = newWidth * (9 / 16);
          playerRef.current.setSize(newWidth, newHeight);
        }
      };

      window.addEventListener("resize", handleResize);

      return () => {
        window.removeEventListener("resize", handleResize);
        clearInterval(timeCheckInterval);
        if (playerRef.current) {
          try {
            playerRef.current.destroy();
            playerRef.current = null;
            currentVideoIdRef.current = null;
          } catch (error) {
            console.error("Error destroying player:", error);
          }
        }
      };
    }, [
      isAPIReady,
      currentSong?.link,
      currentSong?.start_time,
      currentSong?.duration,
      onEnded,
    ]);

    return (
      <div className="relative w-full" ref={containerRef}>
        <div className="relative pt-[56.25%]">
          <div
            id="youtube-player"
            className="absolute top-0 left-0 w-full h-full"
          />
        </div>
        {error && (
          <div className="absolute top-0 left-0 right-0 bg-red-500 text-white p-2 text-center">
            {error}
          </div>
        )}
      </div>
    );
  },
  (prevProps, nextProps) => {
    const prevVideoId = prevProps.currentSong
      ? extractVideoId(prevProps.currentSong.link)
      : null;
    const nextVideoId = nextProps.currentSong
      ? extractVideoId(nextProps.currentSong.link)
      : null;
    return (
      prevVideoId === nextVideoId &&
      prevProps.currentSong?.start_time?.secs_since_epoch ===
        nextProps.currentSong?.start_time?.secs_since_epoch
    );
  },
);

export default YouTubePlayer;
