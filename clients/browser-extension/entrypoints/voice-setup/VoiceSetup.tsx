import React, { useState } from 'react';
import { Mic, CheckCircle, XCircle, ShieldCheck } from "@agentic-browser/shared/icons";

const VoiceSetup: React.FC = () => {
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  const requestPermission = async () => {
    try {
      setStatus('idle');
      // For extensions, sometimes calling chrome.permissions.request first
      // helps ensure the browser knows we have intent.
      // But we'll try the direct getUserMedia first.
      
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      // Stop tracks immediately as we just need the permission
      stream.getTracks().forEach(track => track.stop());
      
      setStatus('success');
    } catch (err: any) {
      console.error("Microphone access error:", err);
      setStatus('error');
      if (err.name === 'NotAllowedError') {
        setErrorMessage("Permission denied. Please click the icon in your address bar to reset microphone permissions for this extension.");
      } else {
        setErrorMessage(err.message || "Could not access microphone.");
      }
    }
  };

  return (
    <div className="setup-container">
      <div className="icon-wrapper">
        <Mic size={20} />
      </div>
      <h1>Allow the microphone</h1>
      <p>
        Voice input needs microphone access. Click the button, then choose <strong>Allow</strong> in the
        browser prompt.
      </p>

      {status === 'success' && (
        <div className="status-box success">
          <CheckCircle size={17} />
          <span>Microphone allowed. You can close this tab.</span>
        </div>
      )}

      {status === 'error' && (
        <div className="status-box error">
          <XCircle size={17} />
          <span>{errorMessage}</span>
        </div>
      )}

      {status !== 'success' && (
        <button 
          className="btn-primary" 
          onClick={requestPermission}
        >
          <ShieldCheck size={17} />
          Allow microphone
        </button>
      )}

      <p className="footer-text">
        You only do this once. Audio is recorded only while the mic button in the side panel is on.
      </p>
    </div>
  );
};

export default VoiceSetup;
