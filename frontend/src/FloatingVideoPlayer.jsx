import { useEffect, useRef, useState } from "react";

function SoundIcon() {
  return (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="white" xmlns="http://www.w3.org/2000/svg">
      <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" />
    </svg>
  );
}

function NewWindowIcon() {
  return (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="white" xmlns="http://www.w3.org/2000/svg">
      <path d="M19 19H5V5h7V3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7h-2v7zM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7z" />
    </svg>
  );
}

export default function FloatingVideoPlayer({ videoId, onClose }) {
  const [isVideoMuted, setIsVideoMuted] = useState(true);
  const [showControls, setShowControls] = useState(true);
  const dismissTimerRef = useRef(null);

  useEffect(() => {
    dismissTimerRef.current = setTimeout(onClose, 30000);
    return () => clearTimeout(dismissTimerRef.current);
  }, [onClose]);

  function handleToggleMute(e) {
    e.stopPropagation();
    setIsVideoMuted((v) => !v);
    setShowControls(false);
    if (dismissTimerRef.current) {
      clearTimeout(dismissTimerRef.current);
      dismissTimerRef.current = null;
    }
  }

  function handleOpenInTab(e) {
    e.stopPropagation();
    window.open(`https://www.youtube.com/watch?v=${videoId}`, "_blank");
    onClose();
  }

  function handleClose(e) {
    e.stopPropagation();
    onClose();
  }

  return (
    <div className="fixed top-4 right-4 z-20 w-64 h-36 shadow-lg rounded-md overflow-hidden">
      {showControls && (
        <div className="absolute inset-0 flex justify-center items-center z-20 bg-black/30">
          <button
            className="w-1/2 h-full flex justify-center items-center transition-all hover:bg-red-700/50"
            onClick={handleToggleMute}
            title="Toggle sound"
          >
            <SoundIcon />
          </button>
          <button
            className="w-1/2 h-full flex justify-center items-center transition-all hover:bg-red-700/50"
            onClick={handleOpenInTab}
            title="Open on YouTube"
          >
            <NewWindowIcon />
          </button>
        </div>
      )}
      <button
        className="absolute z-30 right-1 top-1 px-2 text-red-400 font-extrabold text-xl leading-none transition-all hover:bg-red-700/50 rounded"
        onClick={handleClose}
        title="Close"
      >
        ×
      </button>
      <iframe
        allowFullScreen
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        className="bg-black w-full h-full"
        frameBorder="0"
        loading="lazy"
        src={`https://www.youtube.com/embed/${videoId}?autoplay=1&mute=${isVideoMuted ? 1 : 0}&controls=1&loop=0`}
        title="YouTube Video"
      />
    </div>
  );
}
