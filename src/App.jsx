import React, { useState, useEffect, useRef, memo } from "react";
import { Music, Clock, History, Plus } from "lucide-react";

const formatDuration = (durationObj) => {
  const seconds = durationObj?.secs || 0;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
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

// Memoized YouTube Player component
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

const AddSongForm = ({ onSongAdded }) => {
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess(false);

    try {
      const response = await fetch(`http://157.245.128.28:3000/send`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          url: {
            0: url,
          },
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to add song");
      }

      setSuccess(true);
      setUrl("");
      if (onSongAdded) onSongAdded();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="p-6 bg-white rounded-lg shadow-sm">
      <h2 className="text-lg font-bold mb-4">add new song</h2>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">youtube url</label>
          <input
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className="w-full px-3 py-2 border rounded-md"
            placeholder="https://youtube.com/..."
            required
          />
        </div>
        <button
          type="submit"
          className="w-full bg-blue-600 text-white py-2 rounded-md hover:bg-blue-700 flex items-center justify-center gap-2"
        >
          <Plus size={20} />
          <span>add to queue</span>
        </button>
      </form>
      {error && (
        <div className="mt-4 p-3 bg-red-50 border border-red-200 text-red-600 rounded-md">
          {error}
        </div>
      )}
      {success && (
        <div className="mt-4 p-3 bg-green-50 border border-green-200 text-green-600 rounded-md">
          song added successfully
        </div>
      )}
    </div>
  );
};

const BrutalistApp = () => {
  const [queue, setQueue] = useState([]);
  const [activeTab, setActiveTab] = useState("queue");
  const [apiBaseUrl, setApiBaseUrl] = useState("http://157.245.128.28:3000");
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const currentSongRef = useRef(null);

  const fetchQueue = async () => {
    try {
      const response = await fetch(`${apiBaseUrl}/channels/queue`);
      if (!response.ok) throw new Error("Failed to fetch queue");
      const data = await response.json();
      setQueue(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error("Queue fetch error:", error);
    }
  };

  useEffect(() => {
    fetchQueue();
    const interval = setInterval(fetchQueue, 5000);
    return () => clearInterval(interval);
  }, [apiBaseUrl]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess(false);

    try {
      const response = await fetch(`${apiBaseUrl}/send`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          url: {
            0: url,
          },
        }),
      });

      if (!response.ok) throw new Error("Failed to add song");
      setSuccess(true);
      setUrl("");
      fetchQueue();
    } catch (err) {
      setError(err.message);
    }
  };

  currentSongRef.current = queue[0];

  return (
    <div className="min-h-screen bg-white font-mono">
      {/* Header */}
      <div className="border-b-8 border-black p-6">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row justify-between items-start gap-4">
          <h1 className="text-5xl font-bold uppercase tracking-tight">
            DJ CELESTIA
          </h1>
          <div className="flex items-center gap-2 w-full md:w-auto">
            <span className="uppercase text-sm font-bold">Node:</span>
            <input
              type="text"
              value={apiBaseUrl}
              onChange={(e) => setApiBaseUrl(e.target.value)}
              className="flex-1 md:w-64 px-3 py-2 border-4 border-black font-mono text-sm"
            />
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto p-6 space-y-8">
        {/* Video Player */}
        <div className="border-8 border-black">
          <div className="aspect-video bg-black">
            <YouTubePlayer
              currentSong={currentSongRef.current}
              onEnded={fetchQueue}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Add Song Form */}
          <div className="border-8 border-black p-6">
            <h2 className="text-2xl font-bold uppercase mb-6">ADD NEW SONG</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-bold uppercase mb-2">
                  YOUTUBE URL
                </label>
                <input
                  type="text"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  className="w-full px-4 py-3 border-4 border-black font-mono"
                  placeholder="https://youtube.com/..."
                  required
                />
              </div>
              <button
                type="submit"
                className="w-full bg-black text-white py-4 text-xl font-bold uppercase hover:bg-gray-800 flex items-center justify-center gap-2"
              >
                <Plus size={24} />
                ADD TO QUEUE
              </button>
            </form>
            {error && (
              <div className="mt-4 p-4 border-4 border-red-500 text-red-500 uppercase font-bold">
                {error}
              </div>
            )}
            {success && (
              <div className="mt-4 p-4 border-4 border-green-500 text-green-500 uppercase font-bold">
                SONG ADDED SUCCESSFULLY
              </div>
            )}
          </div>

          {/* Queue/History Section */}
          <div className="border-8 border-black">
            <div className="flex border-b-8 border-black">
              <button
                onClick={() => setActiveTab("queue")}
                className={`flex-1 p-4 uppercase font-bold text-xl flex items-center justify-center gap-2 ${
                  activeTab === "queue"
                    ? "bg-black text-white"
                    : "hover:bg-gray-100"
                }`}
              >
                <Music size={24} />
                QUEUE
              </button>
              <button
                onClick={() => setActiveTab("history")}
                className={`flex-1 p-4 uppercase font-bold text-xl flex items-center justify-center gap-2 ${
                  activeTab === "history"
                    ? "bg-black text-white"
                    : "hover:bg-gray-100"
                }`}
              >
                <History size={24} />
                HISTORY
              </button>
            </div>

            <div className="p-4 space-y-4 max-h-[400px] overflow-y-auto">
              {queue.length > 0 ? (
                queue.map((song, index) => (
                  <div
                    key={`${song.link}-${song.start_time?.secs_since_epoch}`}
                    className={`p-4 border-4 ${index === 0 ? "border-black bg-gray-100" : "border-gray-300"}`}
                  >
                    <QueueItem song={song} isPlaying={index === 0} />
                  </div>
                ))
              ) : (
                <div className="p-8 text-center uppercase font-bold text-gray-500">
                  QUEUE IS EMPTY
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BrutalistApp;

// const App = () => {
//   const [queue, setQueue] = useState([]);
//   const [activeTab, setActiveTab] = useState("queue");
//   const [apiBaseUrl, setApiBaseUrl] = useState("http://localhost:3000");
//   const currentSongRef = useRef(null);

//   const fetchQueue = async () => {
//     try {
//       const response = await fetch(`${apiBaseUrl}/channels/queue`);
//       if (!response.ok) throw new Error("Failed to fetch queue");
//       const data = await response.json();
//       setQueue(Array.isArray(data) ? data : []);
//     } catch (error) {
//       console.error("Queue fetch error:", error);
//     }
//   };

//   useEffect(() => {
//     fetchQueue();
//     const interval = setInterval(fetchQueue, 5000);
//     return () => clearInterval(interval);
//   }, [apiBaseUrl]);

//   currentSongRef.current = queue[0];

//   return (
//     <div className="min-h-screen bg-gray-50 p-4 md:p-8">
//       <div className="max-w-5xl mx-auto space-y-6">
//         <div className="flex flex-col md:flex-row justify-between items-center gap-4">
//           <h1 className="text-3xl font-bold">dj celestia</h1>
//           <div className="flex items-center gap-2">
//             <label className="text-sm text-gray-600">Node Address:</label>
//             <input
//               type="text"
//               value={apiBaseUrl}
//               onChange={(e) => setApiBaseUrl(e.target.value)}
//               className="px-3 py-1 border rounded-md w-64 text-sm"
//               placeholder="http://localhost:3000"
//             />
//           </div>
//         </div>

//         <div className="w-full overflow-hidden rounded-lg shadow-sm">
//           <YouTubePlayer
//             currentSong={currentSongRef.current}
//             onEnded={fetchQueue}
//           />
//         </div>

//         <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
//           <AddSongForm onSongAdded={fetchQueue} apiBaseUrl={apiBaseUrl} />

//           <div className="bg-white rounded-lg shadow-sm p-4">
//             <div className="flex gap-4 mb-4">
//               <button
//                 onClick={() => setActiveTab("queue")}
//                 className={`flex items-center gap-2 px-4 py-2 rounded-md transition-colors ${
//                   activeTab === "queue"
//                     ? "bg-blue-600 text-white"
//                     : "text-gray-600 hover:bg-gray-100"
//                 }`}
//               >
//                 <Music className="w-5 h-5" />
//                 <span>queue</span>
//               </button>
//               <button
//                 onClick={() => setActiveTab("history")}
//                 className={`flex items-center gap-2 px-4 py-2 rounded-md transition-colors ${
//                   activeTab === "history"
//                     ? "bg-blue-600 text-white"
//                     : "text-gray-600 hover:bg-gray-100"
//                 }`}
//               >
//                 <History className="w-5 h-5" />
//                 <span>history</span>
//               </button>
//             </div>

//             <div className="space-y-2">
//               {queue.length > 0 ? (
//                 queue.map((song, index) => (
//                   <QueueItem
//                     key={`${song.link}-${song.start_time?.secs_since_epoch}`}
//                     song={song}
//                     isPlaying={index === 0}
//                   />
//                 ))
//               ) : (
//                 <p className="text-center text-gray-500 py-4">queue is empty</p>
//               )}
//             </div>
//           </div>
//         </div>
//       </div>
//     </div>
//   );
// };

// export default App;
