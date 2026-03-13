import React, { useState } from 'react';
import { Mic, CheckCircle, XCircle, ShieldCheck } from 'lucide-react';

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
        <Mic size={32} />
      </div>
      <h1>Microphone Access</h1>
      <p>
        To enable voice commands, Open DIA needs permission to use your microphone. 
        Click below and select <strong>"Allow"</strong> when the browser prompt appears.
      </p>

      {status === 'success' && (
        <div className="status-box success">
          <CheckCircle size={20} />
          <span>Permission granted! You can now close this tab.</span>
        </div>
      )}

      {status === 'error' && (
        <div className="status-box error">
          <XCircle size={20} />
          <span>{errorMessage}</span>
        </div>
      )}

      {status !== 'success' && (
        <button 
          className="btn-primary" 
          onClick={requestPermission}
        >
          <ShieldCheck size={20} />
          Allow Microphone Access
        </button>
      )}

      <p className="footer-text">
        This is a one-time setup. Your privacy is important; audio is only captured when you explicitly toggle recording.
      </p>
    </div>
  );
};

export default VoiceSetup;
