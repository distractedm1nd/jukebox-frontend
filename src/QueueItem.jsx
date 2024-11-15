import React, { useState, useEffect, useRef, memo } from "react";
import { Music, Clock, History, Plus } from "lucide-react";

const formatDuration = (durationObj) => {
  const seconds = durationObj?.secs || 0;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
};

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

const formatTime = (timeObj) => {
  try {
    if (!timeObj || !timeObj.secs_since_epoch) return "Not scheduled";
    const date = new Date(timeObj.secs_since_epoch * 1000);
    return date.toLocaleTimeString();
  } catch (error) {
    console.error("Error formatting time:", error);
    return "Invalid time";
  }
};

const useVideoTitle = (videoUrl) => {
  const [title, setTitle] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const playerRef = useRef(null);

  useEffect(() => {
    const videoId = extractVideoId(videoUrl);
    if (!videoId) {
      setTitle("Invalid YouTube URL");
      setIsLoading(false);
      return;
    }

    const fetchTitle = () => {
      if (!window.YT?.Player) {
        setTimeout(fetchTitle, 100); // Retry if YT API not ready
        return;
      }

      try {
        // Create a temporary hidden player to get the video title
        const tempPlayer = new window.YT.Player(`temp-player-${videoId}`, {
          videoId: videoId,
          width: 100,
          height: 100,
          playerVars: {
            autoplay: 0,
            controls: 0,
          },
          events: {
            onReady: (event) => {
              const videoTitle = event.target.getVideoData().title;
              setTitle(videoTitle || "Untitled Video");
              setIsLoading(false);
              // Clean up the temporary player
              event.target.destroy();
              const tempDiv = document.getElementById(`temp-player-${videoId}`);
              if (tempDiv) tempDiv.remove();
            },
            onError: () => {
              setTitle("Video not available");
              setIsLoading(false);
            },
          },
        });
        playerRef.current = tempPlayer;
      } catch (error) {
        console.error("Error fetching video title:", error);
        setTitle("Unable to load title");
        setIsLoading(false);
      }
    };

    // Create a hidden container for the temporary player
    const tempDiv = document.createElement("div");
    tempDiv.id = `temp-player-${videoId}`;
    tempDiv.style.position = "absolute";
    tempDiv.style.visibility = "hidden";
    tempDiv.style.top = "-1000px";
    document.body.appendChild(tempDiv);

    fetchTitle();

    return () => {
      if (playerRef.current) {
        try {
          playerRef.current.destroy();
        } catch (error) {
          console.error("Error destroying temp player:", error);
        }
      }
      const tempDiv = document.getElementById(`temp-player-${videoId}`);
      if (tempDiv) tempDiv.remove();
    };
  }, [videoUrl]);

  return { title, isLoading };
};

const QueueItem = ({ song, isPlaying }) => {
  const { title, isLoading } = useVideoTitle(song.link);

  return (
    <div
      className={`p-4 ${
        isPlaying
          ? "border-4 border-black bg-gray-100"
          : "border-4 border-gray-400"
      }`}
    >
      <div className="flex items-center justify-between font-mono">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          {isPlaying && (
            <Music className="w-6 h-6 text-black animate-pulse shrink-0" />
          )}
          <div className="min-w-0 flex-1">
            <p className="font-bold uppercase truncate">
              {isLoading ? (
                <span className="inline-block w-48 h-5 bg-black" />
              ) : (
                title
              )}
            </p>
            <p className="text-sm uppercase">
              STARTS AT {formatTime(song.start_time)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0 uppercase">
          <Clock className="w-5 h-5" />
          <span className="font-bold">{formatDuration(song.duration)}</span>
        </div>
      </div>
    </div>
  );
};

export default QueueItem;
