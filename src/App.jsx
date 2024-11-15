import React, { useState, useEffect, useRef, memo } from "react";
import YouTubePlayer from "./Player";
import AddSongForm from "./AddSongForm";
import QueueItem from "./QueueItem";
import { Music, Clock, History, Plus } from "lucide-react";

const BrutalistApp = () => {
  const [queue, setQueue] = useState([]);
  const [activeTab, setActiveTab] = useState("queue");
  const [apiBaseUrl, setApiBaseUrl] = useState("http://137.184.211.216:3000");
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const currentSongRef = useRef(null);

  const fetchQueue = async () => {
    try {
      const response = await fetch(`${apiBaseUrl}/queue`);
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
            DJ CELESTIA 🪩
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
            <AddSongForm onSongAdded={() => console.log("Song added!")} />
            {/* <h2 className="text-2xl font-bold uppercase mb-6">ADD NEW SONG</h2>
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
            )} */}
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
