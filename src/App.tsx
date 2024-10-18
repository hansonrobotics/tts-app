/*
 * This file is part of TTS App.
 *
 * TTS App is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * TTS App is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with TTS App.  If not, see <https://www.gnu.org/licenses/>.
 */

import React, { useState, KeyboardEvent, useEffect, ChangeEvent, useRef } from 'react';
import './App.css';
import pollyVoicesConfig from './pollyVoices.json';
import azureVoicesConfig from './azureVoices.json';
import { Helmet } from 'react-helmet';
// Add this import for Font Awesome
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPlay, faPause, faDownload, faPaperPlane } from '@fortawesome/free-solid-svg-icons';
import { transliterate } from 'transliteration';

interface AudioMessage {
  id: number;
  text: string;
  audioSrc: string;
  voice: string;
  vendor: string;
  format: 'mp3' | 'wav';
}

interface Voice {
  name: string;
  value: string;
  description: string;
}

interface LanguageVoices {
  language: string;
  voices: Voice[];
}

interface SelectedVoice {
  vendor: string;
  value: string;
  name: string;
  description: string;
}

interface Vendor {
  name: string;
  value: string;
  voices: LanguageVoices[];
}

function AudioMessagePanel({ message }: { message: AudioMessage }) {
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.addEventListener('ended', () => setIsPlaying(false));
      return () => {
        audioRef.current?.removeEventListener('ended', () => setIsPlaying(false));
      };
    }
  }, []);

  const handlePlayPause = () => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
      } else {
        audioRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  const slugify = (text: string) => {
    return transliterate(text)
      .toLowerCase()
      .replace(/[^\w\s-]/g, '') // Remove non-word chars
      .replace(/[\s_-]+/g, '-') // Replace spaces and underscores with hyphens
      .replace(/^-+|-+$/g, '') // Remove leading/trailing hyphens
      .slice(0, 50); // Limit to 50 characters
  };

  const handleDownload = () => {
    const slugifiedText = slugify(message.text);
    const filename = `${slugifiedText}_${message.id}.${message.format}`;
    const link = document.createElement('a');
    link.href = message.audioSrc;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="message-panel">
      <div className="message-content">
        <p className="message-text">{message.text}</p>
        <div className="audio-controls">
          <button className="control-button" onClick={handlePlayPause}>
            <FontAwesomeIcon icon={isPlaying ? faPause : faPlay} />
          </button>
          <button className="control-button" onClick={handleDownload}>
            <FontAwesomeIcon icon={faDownload} />
          </button>
        </div>
      </div>
      <audio ref={audioRef} src={message.audioSrc} />
      <div className="voice-label">
        <span>Vendor: {message.vendor}</span>
        <span>Voice: {message.voice}</span>
        <span>Format: {message.format.toUpperCase()}</span>
      </div>
    </div>
  );
}

function VoiceSelectionModal({
  isOpen,
  onClose,
  voices,
  onSelectVoice,
  selectedVendor
}: {
  isOpen: boolean;
  onClose: () => void;
  voices: LanguageVoices[];
  onSelectVoice: (voice: SelectedVoice) => void;
  selectedVendor: string;
}) {
  const [selectedLanguage, setSelectedLanguage] = useState('');

  if (!isOpen) return null;

  const handleModalClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div className="modal-overlay" onClick={handleModalClick}>
      <div className="modal-content">
        <h2>Select a Voice</h2>
        <select
          value={selectedLanguage}
          onChange={(e) => setSelectedLanguage(e.target.value)}
        >
          <option value="">Select a language</option>
          {voices.map(lang => (
            <option key={lang.language} value={lang.language}>
              {lang.language}
            </option>
          ))}
        </select>
        {selectedLanguage && (
          <div className="voice-list">
            {voices
              .find(lang => lang.language === selectedLanguage)
              ?.voices.map(voice => (
                <button
                  key={voice.value}
                  onClick={() => {
                    onSelectVoice({ ...voice, vendor: selectedVendor });
                    onClose();
                  }}
                >
                  {voice.name} - {voice.description}
                </button>
              ))
            }
          </div>
        )}
      </div>
    </div>
  );
}

function App() {
  const [inputText, setInputText] = useState('');
  const [messages, setMessages] = useState<AudioMessage[]>([]);
  const [selectedVendor, setSelectedVendor] = useState('');
  const [selectedVoice, setSelectedVoice] = useState<SelectedVoice>({ vendor: '', value: '', name: '', description: '' });
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [currentVendorVoices, setCurrentVendorVoices] = useState<LanguageVoices[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [audioFormat, setAudioFormat] = useState<'mp3' | 'wav'>('mp3');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const apiUrl = process.env.REACT_APP_TTS_SERVER_URL;

  const findDefaultVoice = (vendorVoices: any, defaultVoiceName: string | undefined): SelectedVoice | null => {
    for (const languageGroup of vendorVoices) {
      for (const voice of languageGroup.voices) {
        if (voice.name === defaultVoiceName) {
          return {
            vendor: selectedVendor,
            value: voice.value,
            name: voice.name,
            description: voice.description
          };
        }
      }
    }
    // If default voice not found, return the first voice
    if (vendorVoices.length > 0 && vendorVoices[0].voices.length > 0) {
      const firstVoice = vendorVoices[0].voices[0];
      return {
        vendor: selectedVendor,
        value: firstVoice.value,
        name: firstVoice.name,
        description: firstVoice.description
      };
    }
    return null;
  };

  useEffect(() => {
    const combinedVendors: Vendor[] = [
      { name: 'Amazon Polly', value: 'polly', voices: pollyVoicesConfig.voices },
      { name: 'Azure', value: 'azure', voices: azureVoicesConfig.voices }
    ];

    // Sort languages alphabetically for each vendor
    combinedVendors.forEach(vendor => {
      vendor.voices.sort((a, b) => a.language.localeCompare(b.language));
    });

    setVendors(combinedVendors);

    if (combinedVendors.length > 0) {
      const initialVendor = combinedVendors[0];
      setSelectedVendor(initialVendor.value);
      setCurrentVendorVoices(initialVendor.voices);
      
      const vendorConfig = initialVendor.value === 'polly' ? pollyVoicesConfig : azureVoicesConfig;
      const defaultVoice = findDefaultVoice(initialVendor.voices, vendorConfig.defaultVoice);
      if (defaultVoice) {
        setSelectedVoice(defaultVoice);
      }
    }
  }, []);

  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setInputText(event.target.value);
  };

  const handleKeyPress = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      handleSend();
    }
  };

  // Helper function to convert base64 to Blob
  const base64ToBlob = (base64: string, mimeType: string) => {
    const byteCharacters = atob(base64);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    return new Blob([byteArray], { type: mimeType });
  };

  const handleFormatChange = (event: ChangeEvent<HTMLSelectElement>) => {
    setAudioFormat(event.target.value as 'mp3' | 'wav');
  };

  const handleSend = async () => {
    if (inputText.trim()) {
      const fullUrl = `${apiUrl}/${selectedVendor}?voice=${selectedVoice.value}&format=${audioFormat}&text=${encodeURIComponent(inputText)}`;
      console.log('Sending request to:', fullUrl);

      try {
        const response = await fetch(fullUrl);
        const data = await response.json();

        console.log('API Response:', data);

        if (data.response && data.response.data) {
          const audioBlob = base64ToBlob(data.response.data, `audio/${audioFormat}`);
          const audioUrl = URL.createObjectURL(audioBlob);

          const newMessage: AudioMessage = {
            id: Date.now(),
            text: inputText,
            audioSrc: audioUrl,
            voice: selectedVoice.name, // Changed from value to name for better readability
            vendor: selectedVendor,
            format: audioFormat
          };
          setMessages(prevMessages => [...prevMessages, newMessage]);
          setInputText('');
        } else {
          console.error('No audio data received from the API');
          console.error('Full API response:', data);
        }
      } catch (error) {
        console.error('Error calling TTS API:', error);
      }
    }
  };

  const handleVoiceSelection = (voice: SelectedVoice) => {
    setSelectedVoice(voice);
    setSelectedVendor(voice.vendor); // Add this line to update the vendor
  };

  const handleVendorChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const newVendor = event.target.value;
    setSelectedVendor(newVendor);
    
    const vendorConfig = newVendor === 'polly' ? pollyVoicesConfig : azureVoicesConfig;
    const vendorVoices = vendors.find(v => v.value === newVendor)?.voices || [];
    setCurrentVendorVoices(vendorVoices);

    const defaultVoice = findDefaultVoice(vendorVoices, vendorConfig.defaultVoice);
    if (defaultVoice) {
      setSelectedVoice(defaultVoice);
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]); // Scroll to bottom when messages change

  const getVoiceButtonText = () => {
    if (selectedVoice) {
      return `${selectedVoice.name} - ${selectedVoice.description}`;
    }
    return 'Select Voice';
  };

  return (
    <div className="App">
      <Helmet>
        <title>TTS App</title>
      </Helmet>
      <div className="content">
        <div className="messages-container">
          {messages.map(message => (
            <AudioMessagePanel key={message.id} message={message} />
          ))}
          <div ref={messagesEndRef} />
        </div>
      </div>
      <div className="input-container">
        <div className="input-wrapper">
          <div className="voice-selection">
            <select className="vendor-select" value={selectedVendor} onChange={handleVendorChange}>
              {vendors.map(vendor => (
                <option key={vendor.value} value={vendor.value}>{vendor.name}</option>
              ))}
            </select>
            <button className="voice-select-button" onClick={() => setIsModalOpen(true)}>
              {getVoiceButtonText()}
            </button>
            <select className="format-select" value={audioFormat} onChange={handleFormatChange}>
              <option value="mp3">MP3</option>
              <option value="wav">WAV</option>
            </select>
          </div>
          <div className="text-input">
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Enter text to convert to speech"
            />
            <button className="send-button" onClick={handleSend}>
              Send
            </button>
          </div>
        </div>
      </div>
      <VoiceSelectionModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        voices={currentVendorVoices}
        onSelectVoice={handleVoiceSelection}
        selectedVendor={selectedVendor}
      />
    </div>
  );
}

export default App;
