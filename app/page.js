'use client';

import React, { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import ChatWindow from '../components/ChatWindow';
import { Search, Menu, ArrowLeft, Camera, LogOut, X, User, Settings, Edit, Palette, ChevronRight, Bell, Move, Maximize, Minimize, Phone, PhoneOff, Video as VideoIcon, Volume2, Lock, ChevronDown } from 'lucide-react';

const DEFAULT_WALLPAPER = { bgColor: '#8ea1a5', bgImage: 'url("https://web.telegram.org/a/chat-bg-pattern-light.ee148af944f6580293ae.png")', bgSize: 'cover', bgPos: 'center', blend: 'overlay' };

const WALLPAPER_PRESETS = [
  DEFAULT_WALLPAPER,
  { bgColor: '#0f172a', bgImage: 'url("https://web.telegram.org/a/chat-bg-pattern-light.ee148af944f6580293ae.png")', bgSize: 'cover', bgPos: 'center', blend: 'overlay' },
  { bgColor: '#428bb8', bgImage: 'url("https://web.telegram.org/a/chat-bg-pattern-light.ee148af944f6580293ae.png")', bgSize: 'cover', bgPos: 'center', blend: 'overlay' },
  { bgColor: '#1e293b', bgImage: 'none', bgSize: 'cover', bgPos: 'center', blend: 'normal' },
  { bgColor: '#000000', bgImage: 'none', bgSize: 'cover', bgPos: 'center', blend: 'normal' },
  { bgColor: 'transparent', bgImage: 'linear-gradient(to top right, #a1c4fd, #c2e9fb)', bgSize: 'cover', bgPos: 'center', blend: 'normal' },
  { bgColor: 'transparent', bgImage: 'linear-gradient(135deg, #fbc2eb 0%, #a6c1ee 100%)', bgSize: 'cover', bgPos: 'center', blend: 'normal' }
];

export default function AllogramApp() {
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [socket, setSocket] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  
  const [isLoginMode, setIsLoginMode] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  
  const [activeChat, setActiveChat] = useState(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [settingsView, setSettingsView] = useState('main'); 
  
  const [wallpaper, setWallpaper] = useState(DEFAULT_WALLPAPER);
  const [customWallPreview, setCustomWallPreview] = useState(null);
  
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [notificationVolume, setNotificationVolume] = useState(1);
  const [callVolume, setCallVolume] = useState(1);
  
  const currentUserRef = useRef(currentUser);
  const notifEnabledRef = useRef(notificationsEnabled);
  const notifVolRef = useRef(notificationVolume);
  
  useEffect(() => { currentUserRef.current = currentUser; }, [currentUser]);
  useEffect(() => { notifEnabledRef.current = notificationsEnabled; }, [notificationsEnabled]);
  useEffect(() => { notifVolRef.current = notificationVolume; }, [notificationVolume]);

  const [editName, setEditName] = useState('');
  const [editAvatar, setEditAvatar] = useState(null);
  const [chats, setChats] = useState([]);
  const [allMessages, setAllMessages] = useState({});
  const [isNewChatModalOpen, setIsNewChatModalOpen] = useState(false);
  const [newChatName, setNewChatName] = useState('');
  const [allUsers, setAllUsers] = useState([]);
  const [userStatuses, setUserStatuses] = useState({});

  const [callState, setCallState] = useState('idle');
  const [callInfo, setCallInfo] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null); 
  const [isCallMinimized, setIsCallMinimized] = useState(false);
  
  const pcRef = useRef(null); 
  const localStreamRef = useRef(null);
  const iceCandidatesQueue = useRef([]);

  useEffect(() => {
    const newSocket = io(window.location.origin);
    
    newSocket.on('connect', () => {
      setIsConnected(true);
      const savedWall = localStorage.getItem('allogram_wallpaper');
      if (savedWall) { try { const parsed = JSON.parse(savedWall); if (parsed) setWallpaper(parsed); } catch (e) { setWallpaper(DEFAULT_WALLPAPER); } }
      const savedNotifEnabled = localStorage.getItem('allogram_notif_enabled');
      if (savedNotifEnabled !== null) setNotificationsEnabled(savedNotifEnabled === 'true');
      const savedNotifVol = localStorage.getItem('allogram_notif_vol');
      if (savedNotifVol !== null) setNotificationVolume(parseFloat(savedNotifVol));
      const savedCallVol = localStorage.getItem('allogram_call_vol');
      if (savedCallVol !== null) setCallVolume(parseFloat(savedCallVol));

      const savedEmail = localStorage.getItem('allogram_email');
      const savedPass = localStorage.getItem('allogram_password');
      
      if (savedEmail && savedPass) {
        newSocket.emit('login', { email: savedEmail, password: savedPass }, (response) => {
          if (response.success) {
            setCurrentUser(response.user);
            setEditName(response.user.name);
            setEditAvatar(response.user.avatar);
            newSocket.emit('get_all_users', (users) => setAllUsers(users));
          } else localStorage.clear();
          setIsCheckingAuth(false);
        });
      } else setIsCheckingAuth(false);
    });

    newSocket.on('disconnect', () => setIsConnected(false));
    newSocket.on('init_data', (data) => { setChats(data.chats); setAllMessages(data.messages); });
    newSocket.on('chat_created', (newChat) => setChats(prev => [...prev, newChat]));
    newSocket.on('chat_updated', (updatedChat) => {
      setChats(prev => {
        const exists = prev.find(c => c.id === updatedChat.id);
        if (exists) return prev.map(c => c.id === updatedChat.id ? updatedChat : c);
        return [...prev, updatedChat];
      });
      setActiveChat(prev => prev?.id === updatedChat.id ? updatedChat : prev);
    });
    newSocket.on('chat_deleted', (chatId) => {
      setChats(prev => prev.filter(c => c.id !== chatId));
      setAllMessages(prev => { const newMsgs = { ...prev }; delete newMsgs[chatId]; return newMsgs; });
      setActiveChat(prev => prev?.id === chatId ? null : prev);
    });

    newSocket.on('message_edited', ({ chatId, msgId, newContent, isEdited }) => {
      setAllMessages(prev => {
        const chatMsgs = prev[chatId] || [];
        return { ...prev, [chatId]: chatMsgs.map(m => m.id === msgId ? { ...m, content: newContent, isEdited } : m) };
      });
    });

    newSocket.on('messages_read', ({ chatId, messageIds, userEmail }) => {
      setAllMessages(prev => {
        const chatMsgs = prev[chatId] || [];
        return {
          ...prev,
          [chatId]: chatMsgs.map(m => messageIds.includes(m.id) && m.senderEmail !== userEmail ? { ...m, readBy: [...new Set([...(m.readBy||[]), userEmail])] } : m)
        };
      });
    });

    newSocket.on('receive_message', (msg) => {
      setAllMessages(prev => ({ ...prev, [msg.chatId]: [...(prev[msg.chatId] || []), msg] }));
      if (currentUserRef.current && msg.senderEmail !== currentUserRef.current.email && notifEnabledRef.current) {
        const audio = new Audio('https://actions.google.com/sounds/v1/ui_designer/pop_up.ogg');
        audio.volume = notifVolRef.current;
        audio.play().catch(e => console.log('Autoplay blocked'));
      }
    });

    newSocket.on('user_statuses', (statuses) => setUserStatuses(statuses));
    newSocket.on('users_updated', (users) => setAllUsers(users));

    newSocket.on('webrtc_offer', async ({ offer, callerData, isVideo }) => {
      setCallInfo({ ...callerData, isIncoming: true, offer, isVideo });
      setCallState('receiving');
      setIsCallMinimized(false);
      iceCandidatesQueue.current = []; 
    });

    newSocket.on('webrtc_answer', async ({ answer }) => { 
      setCallState('active'); 
      if (pcRef.current) {
        try {
          await pcRef.current.setRemoteDescription(new RTCSessionDescription(answer));
          iceCandidatesQueue.current.forEach(async (candidate) => {
            try { await pcRef.current.addIceCandidate(new RTCIceCandidate(candidate)); } catch(e){}
          });
          iceCandidatesQueue.current = [];
        } catch(e) { console.error("WebRTC Answer Error:", e); }
      } 
    });

    newSocket.on('webrtc_ice', async ({ candidate }) => { 
      if (pcRef.current && pcRef.current.remoteDescription && pcRef.current.remoteDescription.type) {
        try { await pcRef.current.addIceCandidate(new RTCIceCandidate(candidate)); } catch(e) {}
      } else {
        iceCandidatesQueue.current.push(candidate);
      }
    });

    newSocket.on('end_call', () => cleanupCall());

    setSocket(newSocket);
    return () => newSocket.disconnect();
  }, []);

  useEffect(() => {
    if (callState === 'idle') return;

    const audioEl = document.getElementById('remote-audio');
    if (audioEl && remoteStream && (!callInfo || !callInfo.isVideo)) {
      audioEl.srcObject = remoteStream;
      audioEl.play().catch(e => console.warn('Audio play error:', e));
    }

    const videoEl = document.getElementById('remote-video');
    if (videoEl && remoteStream && callInfo && callInfo.isVideo) {
      videoEl.srcObject = remoteStream;
      videoEl.play().catch(e => console.warn('Video play error:', e));
    }

    const localEl = document.getElementById('local-video');
    if (localEl && localStreamRef.current && callInfo && callInfo.isVideo) {
      localEl.srcObject = localStreamRef.current;
      localEl.play().catch(e => console.warn('Local play error:', e));
    }
  }, [remoteStream, callState, callInfo]);

  useEffect(() => {
    const audioEl = document.getElementById('remote-audio');
    if (audioEl) audioEl.volume = callVolume;
    const videoEl = document.getElementById('remote-video');
    if (videoEl) videoEl.volume = callVolume;
  }, [callVolume]);

  const handleAuth = () => {
    setErrorMsg('');
    if (!socket || !isConnected) return;
    if (isLoginMode) {
      socket.emit('login', { email, password }, (response) => {
        if (response.success) {
          setCurrentUser(response.user); setEditName(response.user.name); setEditAvatar(response.user.avatar);
          localStorage.setItem('allogram_email', email); localStorage.setItem('allogram_password', password);
          socket.emit('get_all_users', (users) => setAllUsers(users));
        } else setErrorMsg(response.error);
      });
    } else {
      socket.emit('register', { email, password, name }, (response) => {
        if (response.success) { setIsLoginMode(true); setErrorMsg('Успешная регистрация! Теперь войдите.'); setPassword(''); } else setErrorMsg(response.error);
      });
    }
  };

  const handleLogout = () => { socket.emit('logout'); localStorage.clear(); setCurrentUser(null); setIsSettingsOpen(false); setActiveChat(null); setEmail(''); setPassword(''); setChats([]); setAllMessages({}); };
  const handleAvatarUpload = (e) => { const file = e.target.files[0]; if (file) { const reader = new FileReader(); reader.onloadend = () => setEditAvatar(reader.result); reader.readAsDataURL(file); } };
  const saveProfile = () => { if (!editName.trim()) return; socket.emit('update_profile', { email: currentUser.email, name: editName, avatar: editAvatar }); setCurrentUser({ ...currentUser, name: editName, avatar: editAvatar }); setIsProfileModalOpen(false); };
  const createChat = () => { if (!newChatName.trim()) return; socket.emit('create_chat', { name: newChatName }); setNewChatName(''); setIsNewChatModalOpen(false); };
  
  const changeWallpaper = (newConfig) => { setWallpaper(newConfig); localStorage.setItem('allogram_wallpaper', JSON.stringify(newConfig)); };
  const toggleNotifications = () => { const newVal = !notificationsEnabled; setNotificationsEnabled(newVal); localStorage.setItem('allogram_notif_enabled', newVal); };
  const changeNotifVolume = (e) => { const val = parseFloat(e.target.value); setNotificationVolume(val); localStorage.setItem('allogram_notif_vol', val); };
  const changeCallVolume = (e) => { const val = parseFloat(e.target.value); setCallVolume(val); localStorage.setItem('allogram_call_vol', val); };
  const closeSettings = () => { setIsSettingsModalOpen(false); setTimeout(() => setSettingsView('main'), 200); };

  const createPeerConnection = (targetEmail) => {
    // ИСПРАВЛЕНИЕ: Возвращены все 5 серверов Google STUN для идеальной связи
    const config = { 
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' }, 
        { urls: 'stun:stun1.l.google.com:19302' }, 
        { urls: 'stun:stun2.l.google.com:19302' },
        { urls: 'stun:stun3.l.google.com:19302' },
        { urls: 'stun:stun4.l.google.com:19302' }
      ] 
    };
    const pc = new RTCPeerConnection(config);
    pc.onicecandidate = (e) => { if (e.candidate && socket) socket.emit('webrtc_ice', { targetEmail, candidate: e.candidate }); };
    pc.ontrack = (e) => { 
      if (e.streams && e.streams[0]) { 
        setRemoteStream(e.streams[0]); 
      } else { 
        let inboundStream = new MediaStream(); 
        inboundStream.addTrack(e.track); 
        setRemoteStream(inboundStream); 
      }
    };
    pcRef.current = pc;
    return pc;
  };

  const startCall = async (targetUser, isVideo = false) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: isVideo });
      localStreamRef.current = stream;
      setCallInfo({ ...targetUser, isIncoming: false, isVideo });
      setCallState('calling');
      setIsCallMinimized(false);
      iceCandidatesQueue.current = [];
      const pc = createPeerConnection(targetUser.email);
      stream.getTracks().forEach(track => pc.addTrack(track, stream));
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socket.emit('webrtc_offer', { targetEmail: targetUser.email, offer, callerData: { email: currentUser.email, name: currentUser.name, avatar: currentUser.avatar }, isVideo });
    } catch (err) { alert('Не удалось получить доступ к микрофону/камере.'); }
  };

  const acceptCall = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: callInfo.isVideo });
      localStreamRef.current = stream;
      setCallState('active');
      const pc = createPeerConnection(callInfo.email);
      stream.getTracks().forEach(track => pc.addTrack(track, stream));
      await pc.setRemoteDescription(new RTCSessionDescription(callInfo.offer));
      iceCandidatesQueue.current.forEach(async (candidate) => { try { await pc.addIceCandidate(new RTCIceCandidate(candidate)); } catch(e){} });
      iceCandidatesQueue.current = [];
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket.emit('webrtc_answer', { targetEmail: callInfo.email, answer });
    } catch (err) { alert('Не удалось получить доступ к устройствам.'); cleanupCall(); }
  };

  const endCall = () => { if (callInfo && socket) socket.emit('end_call', { targetEmail: callInfo.email }); cleanupCall(); };
  const cleanupCall = () => { if (pcRef.current) { pcRef.current.close(); pcRef.current = null; } if (localStreamRef.current) { localStreamRef.current.getTracks().forEach(t => t.stop()); localStreamRef.current = null; } setRemoteStream(null); setCallState('idle'); setCallInfo(null); iceCandidatesQueue.current = []; setIsCallMinimized(false); };

  if (isCheckingAuth) return (
    <div className="flex h-[100dvh] items-center justify-center bg-[#e6ebea]">
      <div className="flex flex-col items-center">
        <div className="w-24 h-24 mb-6 rounded-full overflow-hidden shadow-2xl animate-pulse bg-transparent flex items-center justify-center p-0">
           <img src="/logo.jpg" alt="Allogram Logo" className="w-full h-full object-cover scale-110" />
        </div>
        <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    </div>
  );

  if (!currentUser) return (
    <div className="flex items-center justify-center min-h-[100dvh] bg-[#e6ebea]">
      <div className="bg-white p-8 rounded-2xl shadow-xl w-full max-w-sm text-center animate-in fade-in zoom-in duration-300">
        <div className="w-28 h-28 mb-4 mx-auto rounded-full overflow-hidden shadow-2xl bg-transparent flex items-center justify-center p-0">
          <img src="/logo.jpg" alt="Allogram Logo" className="w-full h-full object-cover scale-110" />
        </div>
        <h1 className="text-2xl font-black mb-2 text-gray-800 uppercase tracking-widest tracking-wider">ALLOGRAM</h1>
        <div className="mb-4 flex items-center justify-center gap-2">
          <div className={`w-2.5 h-2.5 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500 animate-pulse'}`}></div>
          <span className="text-xs text-gray-500 font-medium">{isConnected ? 'Сервер подключен' : 'Подключение...'}</span>
        </div>
        {errorMsg && <p className={`mb-4 text-sm font-medium ${errorMsg.includes('Успешная') ? 'text-green-500' : 'text-red-500'}`}>{errorMsg}</p>}
        {!isLoginMode && <input type="text" placeholder="Ваше Имя" value={name} onChange={e => setName(e.target.value)} className="w-full mb-3 px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:border-blue-500 transition-colors text-[16px]" />}
        <input type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} className="w-full mb-3 px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:border-blue-500 transition-colors text-[16px]" />
        <input type="password" placeholder="Пароль" value={password} onChange={e => setPassword(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAuth()} className="w-full mb-6 px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:border-blue-500 transition-colors text-[16px]" />
        <button onClick={handleAuth} disabled={!isConnected} className={`w-full text-white py-3.5 rounded-xl font-semibold mb-4 transition-all shadow-md active:scale-[0.98] ${isConnected ? 'bg-blue-500 hover:bg-blue-600' : 'bg-gray-400'}`}>{isLoginMode ? 'ВОЙТИ' : 'ЗАРЕГИСТРИРОВАТЬСЯ'}</button>
        <button onClick={() => { setIsLoginMode(!isLoginMode); setErrorMsg(''); }} className="text-blue-500 text-sm font-medium hover:underline">{isLoginMode ? 'Создать аккаунт' : 'Уже есть аккаунт? Войти'}</button>
      </div>
    </div>
  );

  const visibleChats = chats.filter(c => c.isGlobal || c.members?.some(m => m.email === currentUser.email));
  const getChatDisplayData = (chat) => chat.type === 'private' ? { name: (chat.members.find(m => m.email !== currentUser.email) || chat.members[0]).name, avatar: (chat.members.find(m => m.email !== currentUser.email) || chat.members[0]).avatar, initials: (chat.members.find(m => m.email !== currentUser.email) || chat.members[0]).name.substring(0, 2).toUpperCase() } : { name: chat.name, avatar: null, initials: chat.name.substring(0, 2).toUpperCase() };
  const decryptPreview = (text, key) => { try { let decoded = decodeURIComponent(atob(text)); let result = ''; for (let i = 0; i < decoded.length; i++) result += String.fromCharCode(decoded.charCodeAt(i) ^ key.charCodeAt(i % key.length)); return result; } catch(e) { return text; } };
  const getLastMessagePreview = (chatId) => { const msgs = allMessages[chatId] || []; if (msgs.length === 0) return 'Нет сообщений'; const last = msgs[msgs.length - 1]; if (last.type === 'audio') return '🎤 Голосовое сообщение'; if (last.type === 'video') return '📹 Видеосообщение'; if (last.type === 'image') return '🖼️ Фотография'; if (last.type === 'image_gallery') return '🖼️ Альбом'; if (last.type === 'file') return '📎 Файл'; return decryptPreview(last.content, `ALLOGRAM_E2EE_${chatId}`); };

  return (
    <div className="flex h-[100dvh] bg-white overflow-hidden text-black font-sans relative animate-in fade-in duration-500">
      
      {/* ИСПРАВЛЕНИЕ ДЛЯ АЙФОНА: Плеер прозрачный, но не 'display: none', чтобы микрофон работал */}
      {callState !== 'idle' && callInfo && (
        <audio id="remote-audio" autoPlay playsInline className="absolute opacity-0 w-0 h-0 pointer-events-none" />
      )}

      {isCallMinimized && callState !== 'idle' && callInfo && (
        <div onClick={() => setIsCallMinimized(false)} className="fixed top-4 right-4 md:top-6 md:right-6 z-[10001] bg-green-500 hover:bg-green-600 text-white pl-4 pr-2 py-2 rounded-full shadow-2xl cursor-pointer flex items-center gap-3 transition-all hover:scale-105 animate-in fade-in slide-in-from-top-4 border-2 border-white/20">
          {callInfo.isVideo ? <VideoIcon size={20} className="fill-current" /> : <Phone size={20} className="fill-current" />}
          <div className="flex flex-col"><span className="font-bold text-[13px] leading-tight max-w-[100px] truncate">{callInfo.name}</span><span className="text-[11px] font-medium opacity-90 leading-tight">{callState === 'active' ? 'Идет звонок...' : 'Вызов...'}</span></div>
          <button onClick={(e) => { e.stopPropagation(); endCall(); }} className="w-8 h-8 bg-red-500 hover:bg-red-600 rounded-full flex items-center justify-center ml-2 transition-transform hover:scale-110 shadow-sm"><PhoneOff size={14} /></button>
        </div>
      )}

      <div className={`absolute top-0 left-0 h-full w-[350px] bg-white z-40 shadow-2xl transform transition-transform duration-300 ease-in-out ${isSettingsOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="bg-gradient-to-tr from-blue-500 to-blue-600 h-40 p-4 flex flex-col justify-between text-white">
          <button onClick={() => setIsSettingsOpen(false)} className="self-start p-2 hover:bg-white/20 rounded-full transition-colors"><ArrowLeft size={24} /></button>
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center text-blue-500 font-bold text-2xl shadow-lg relative overflow-hidden">{currentUser.avatar ? <img src={currentUser.avatar} alt="avatar" className="w-full h-full object-cover" /> : currentUser.name.charAt(0).toUpperCase()}</div>
            <div><h2 className="font-semibold text-lg">{currentUser.name}</h2><p className="text-blue-100 text-sm">{currentUser.email}</p></div>
          </div>
        </div>
        <div className="p-2 mt-2">
          <div onClick={() => { setIsSettingsOpen(false); setIsProfileModalOpen(true); }} className="p-3 hover:bg-gray-100 rounded-xl cursor-pointer mb-1 flex items-center gap-3"><User size={20} className="text-gray-500" /><p className="font-medium text-gray-800">Изменить профиль</p></div>
          <div onClick={() => { setIsSettingsOpen(false); setIsSettingsModalOpen(true); }} className="p-3 hover:bg-gray-100 rounded-xl cursor-pointer mb-1 flex items-center gap-3"><Settings size={20} className="text-gray-500" /><p className="font-medium text-gray-800">Настройки</p></div>
          <div className="h-px bg-gray-200 my-2 mx-3"></div>
          <div onClick={handleLogout} className="p-3 hover:bg-red-50 rounded-xl cursor-pointer flex items-center gap-3 text-red-500"><LogOut size={20} /><p className="font-medium">Выйти</p></div>
        </div>
      </div>

      {isSettingsOpen && <div onClick={() => setIsSettingsOpen(false)} className="absolute inset-0 bg-black/30 z-30 transition-opacity"></div>}

      {isSettingsModalOpen && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm transition-opacity" onClick={closeSettings}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden animate-in fade-in zoom-in duration-200" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center p-4 border-b">
              {settingsView === 'main' ? <h2 className="text-lg font-semibold text-gray-800">Настройки</h2> : <div className="flex items-center gap-2"><button onClick={() => setSettingsView('main')} className="p-1.5 hover:bg-gray-100 rounded-full transition-colors -ml-1"><ArrowLeft size={20} className="text-gray-600" /></button><h2 className="text-lg font-semibold text-gray-800">{settingsView === 'personalization' ? 'Персонализация' : 'Уведомления и звуки'}</h2></div>}
              <button onClick={closeSettings} className="p-1.5 hover:bg-gray-100 rounded-full transition-colors"><X size={20} /></button>
            </div>
            {settingsView === 'main' && (
              <div className="p-3">
                <div className="flex flex-col gap-1">
                  <button onClick={() => setSettingsView('personalization')} className="flex items-center gap-3 p-3 w-full hover:bg-gray-50 active:bg-gray-100 rounded-xl transition-colors text-left"><div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center text-purple-500"><Palette size={18} /></div><span className="font-medium text-[15px] text-gray-800 flex-1">Персонализация</span><ChevronRight size={18} className="text-gray-400" /></button>
                  <button onClick={() => setSettingsView('notifications')} className="flex items-center gap-3 p-3 w-full hover:bg-gray-50 active:bg-gray-100 rounded-xl transition-colors text-left"><div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-500"><Bell size={18} /></div><span className="font-medium text-[15px] text-gray-800 flex-1">Уведомления</span><ChevronRight size={18} className="text-gray-400" /></button>
                </div>
              </div>
            )}
            {settingsView === 'personalization' && (
              <div className="p-5 animate-in slide-in-from-right-4 duration-200">
                <div className="bg-gray-50 p-4 rounded-xl border border-gray-100">
                  <div className="flex items-center gap-2 mb-3 text-purple-500"><Palette size={20} /><h4 className="text-[15px] font-semibold text-gray-800">Обои чата</h4></div>
                  <div className="grid grid-cols-3 gap-3 max-h-60 overflow-y-auto p-1 scrollbar-hide">
                    {WALLPAPER_PRESETS.map((preset, idx) => (<div key={idx} onClick={() => changeWallpaper(preset)} className={`h-20 rounded-xl cursor-pointer border-2 transition-all hover:scale-105 shadow-sm ${wallpaper.bgImage === preset.bgImage && wallpaper.bgColor === preset.bgColor ? 'border-purple-500' : 'border-transparent'}`} style={{ backgroundColor: preset.bgColor, backgroundImage: preset.bgImage, backgroundBlendMode: preset.blend, backgroundSize: preset.bgSize }}></div>))}
                  </div>
                  <label className="mt-4 flex items-center justify-center w-full py-2.5 bg-purple-100 hover:bg-purple-200 text-purple-600 rounded-lg cursor-pointer transition-colors font-medium text-sm">
                    <Camera size={18} className="mr-2" /> Свои обои
                    <input type="file" accept="image/*" className="hidden" onChange={(e) => { const file = e.target.files[0]; if (file) { const reader = new FileReader(); reader.onloadend = () => setCustomWallPreview(reader.result); reader.readAsDataURL(file); } }} />
                  </label>
                </div>
              </div>
            )}
            {settingsView === 'notifications' && (
              <div className="p-5 animate-in slide-in-from-right-4 duration-200">
                <div className="bg-gray-50 p-4 rounded-xl border border-gray-100">
                  <div className="flex items-center gap-2 mb-5 text-blue-500"><Volume2 size={20} /><h4 className="text-[15px] font-semibold text-gray-800">Звуки приложения</h4></div>
                  <div className="flex items-center justify-between mb-5"><span className="text-[15px] font-medium text-gray-800">Уведомления</span><label className="relative inline-flex items-center cursor-pointer"><input type="checkbox" className="sr-only peer" checked={notificationsEnabled} onChange={toggleNotifications} /><div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-500"></div></label></div>
                  <div className={`flex flex-col gap-2 mb-5 transition-opacity ${!notificationsEnabled ? 'opacity-50 pointer-events-none' : 'opacity-100'}`}><div className="flex justify-between items-center text-[13px] text-gray-500 font-medium"><span>Громкость уведомлений</span><span>{Math.round(notificationVolume * 100)}%</span></div><input type="range" min="0" max="1" step="0.01" value={notificationVolume} onChange={changeNotifVolume} className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-500" /></div>
                  <div className="flex flex-col gap-2 pt-4 border-t border-gray-200"><div className="flex justify-between items-center text-[13px] text-gray-500 font-medium"><span>Громкость звонков</span><span>{Math.round(callVolume * 100)}%</span></div><input type="range" min="0" max="1" step="0.01" value={callVolume} onChange={changeCallVolume} className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-500" /></div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {isProfileModalOpen && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm transition-opacity">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden animate-in fade-in zoom-in duration-200">
             <div className="flex justify-between items-center p-4 border-b"><h2 className="text-lg font-semibold text-gray-800">Редактировать профиль</h2><button onClick={() => setIsProfileModalOpen(false)} className="p-1.5 hover:bg-gray-100 rounded-full transition-colors"><X size={20} /></button></div>
            <div className="p-5 flex flex-col items-center">
              <label className="w-24 h-24 rounded-full bg-blue-100 flex items-center justify-center text-blue-500 mb-4 cursor-pointer relative overflow-hidden group">
                {editAvatar ? <img src={editAvatar} className="w-full h-full object-cover" /> : <Camera size={32} />}<div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"><Camera size={24} className="text-white" /></div><input type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />
              </label>
              <div className="w-full mb-6"><label className="text-xs text-blue-500 font-bold ml-1 uppercase">Имя</label><input type="text" value={editName} onChange={(e) => setEditName(e.target.value)} className="w-full mt-1 px-4 py-2 bg-gray-50 border-b-2 border-blue-500 outline-none font-medium transition-colors text-[16px]" /></div>
              <button onClick={saveProfile} className="w-full bg-blue-500 hover:bg-blue-600 text-white font-semibold py-3 rounded-xl transition-all active:scale-95 shadow-md">Сохранить</button>
            </div>
          </div>
        </div>
      )}

      {isNewChatModalOpen && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm transition-opacity">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="flex justify-between items-center p-4 border-b"><h2 className="text-lg font-semibold text-gray-800">Новая группа</h2><button onClick={() => setIsNewChatModalOpen(false)} className="p-1.5 hover:bg-gray-100 rounded-full transition-colors"><X size={20} /></button></div>
            <div className="p-5">
              <input type="text" placeholder="Название группы" value={newChatName} onChange={e => setNewChatName(e.target.value)} autoFocus onKeyDown={e => e.key === 'Enter' && createChat()} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:border-blue-500 mb-4 transition-colors text-[16px]" />
              <button onClick={createChat} className="w-full bg-blue-500 hover:bg-blue-600 text-white font-semibold py-3 rounded-xl transition-all active:scale-95 shadow-md">Создать</button>
            </div>
          </div>
        </div>
      )}

      {callState !== 'idle' && callInfo && (
        <div className={`fixed inset-0 bg-gray-900 flex flex-col justify-between items-center py-10 transition-all duration-500 overflow-hidden ${isCallMinimized ? 'translate-y-full opacity-0 pointer-events-none' : 'translate-y-0 opacity-100 z-[10000]'}`}>
          <button onClick={() => setIsCallMinimized(true)} className="absolute top-10 left-6 z-50 p-2.5 bg-white/10 hover:bg-white/20 rounded-full text-white backdrop-blur-md transition-all active:scale-95 border border-white/20 shadow-lg"><ChevronDown size={28} /></button>
          {callInfo.isVideo && (
            <>
              <video id="remote-video" autoPlay playsInline className="absolute inset-0 w-full h-full object-cover z-0" />
              {(callState === 'calling' || callState === 'active') && <div className="absolute top-6 right-6 md:top-10 md:right-10 w-28 h-40 md:w-40 md:h-56 bg-black/80 rounded-2xl overflow-hidden border-2 border-white/30 shadow-2xl z-30"><video id="local-video" autoPlay muted playsInline className="w-full h-full object-cover scale-x-[-1]" /></div>}
              {callState !== 'active' && <div className="absolute inset-0 bg-black/50 pointer-events-none z-10" />}
            </>
          )}
          <div className="z-20 pt-4 px-4 w-full flex justify-center"><div className="px-5 py-1.5 bg-white/10 border border-white/20 rounded-full text-white/90 text-xs font-bold tracking-widest uppercase shadow-lg backdrop-blur-md">{callInfo.isVideo ? 'Видеозвонок' : 'Аудиозвонок'}</div></div>
          {!(callInfo.isVideo && callState === 'active') && (
            <div className="flex-1 flex flex-col items-center justify-center z-20 w-full px-4 text-white pb-10">
               {!callInfo.isVideo && <div className="w-32 h-32 md:w-40 md:h-40 rounded-full overflow-hidden bg-gradient-to-tr from-blue-400 to-blue-600 mb-6 flex items-center justify-center text-5xl md:text-6xl font-bold shadow-[0_0_80px_rgba(59,130,246,0.3)] animate-pulse">{callInfo.avatar ? <img src={callInfo.avatar} className="w-full h-full object-cover" /> : callInfo.name.charAt(0).toUpperCase()}</div>}
               <h2 className="text-3xl md:text-4xl font-bold mb-3 drop-shadow-lg text-center">{callInfo.name}</h2>
               <div className="flex items-center gap-1.5 text-[11px] md:text-[12px] font-medium text-green-400 bg-green-500/10 px-4 py-1.5 rounded-full border border-green-500/20 mb-6 shadow-sm backdrop-blur-md"><Lock size={14} /> Защищено сквозным шифрованием</div>
               <p className="text-blue-400 text-lg md:text-xl tracking-wide animate-pulse drop-shadow-md font-medium">{callState === 'calling' ? 'Вызов...' : callState === 'receiving' ? 'Входящий вызов...' : 'Соединение установлено'}</p>
            </div>
          )}
          {(callInfo.isVideo && callState === 'active') && <div className="flex-1 pointer-events-none z-10"></div>}
          <div className="w-full flex justify-center gap-8 md:gap-12 z-20 pb-6">
            {callState === 'receiving' && <button onClick={acceptCall} className="w-16 h-16 md:w-20 md:h-20 bg-green-500 rounded-full flex items-center justify-center hover:bg-green-600 transition-transform active:scale-95 shadow-[0_0_40px_rgba(34,197,94,0.5)]">{callInfo.isVideo ? <VideoIcon size={28} className="text-white fill-current md:w-8 md:h-8" /> : <Phone size={28} className="text-white fill-current md:w-8 md:h-8" />}</button>}
            <button onClick={endCall} className="w-16 h-16 md:w-20 md:h-20 bg-red-500 rounded-full flex items-center justify-center hover:bg-red-600 transition-transform active:scale-95 shadow-[0_0_40px_rgba(239,68,68,0.5)]"><PhoneOff size={28} className="text-white md:w-8 md:h-8" /></button>
          </div>
        </div>
      )}

      <div className={`w-full md:w-[350px] border-r border-gray-200 flex flex-col ${activeChat ? 'hidden md:flex' : 'flex'} z-20`}>
        <div className="flex items-center p-3 gap-2"><button onClick={() => setIsSettingsOpen(true)} className="p-2 hover:bg-gray-100 rounded-full transition-colors"><Menu className="text-gray-500" /></button><div className="flex-1 bg-[#f4f4f5] rounded-full flex items-center px-4 py-2 transition-colors focus-within:bg-gray-100"><Search size={18} className="text-gray-400 mr-2" /><input type="text" placeholder="Поиск" className="bg-transparent border-none outline-none w-full text-[16px]" /></div></div>
        <div className="flex-1 overflow-y-auto relative">
          {visibleChats.map(chat => {
            const displayData = getChatDisplayData(chat);
            return (
              <div key={chat.id} onClick={() => setActiveChat(chat)} className={`flex items-center p-3 cursor-pointer transition-colors ${activeChat?.id === chat.id ? 'bg-blue-50' : 'hover:bg-gray-50'}`}>
                <div className="w-14 h-14 bg-gradient-to-tr from-blue-400 to-blue-600 rounded-full flex-shrink-0 mr-3 shadow-sm flex items-center justify-center text-white font-bold text-lg uppercase overflow-hidden">{displayData.avatar ? <img src={displayData.avatar} className="w-full h-full object-cover" /> : displayData.initials}</div>
                <div className="flex-1 border-b border-gray-100 pb-3 mt-3 overflow-hidden"><h3 className="font-semibold text-[16px] text-gray-900">{displayData.name}</h3><p className="text-gray-500 text-[14px] truncate">{getLastMessagePreview(chat.id)}</p></div>
              </div>
            );
          })}
          <button onClick={() => setIsNewChatModalOpen(true)} className="absolute bottom-6 right-6 w-14 h-14 bg-blue-500 hover:bg-blue-600 text-white rounded-full shadow-lg flex items-center justify-center transition-transform hover:scale-105 active:scale-95"><Edit size={24} className="ml-0.5" /></button>
        </div>
      </div>

      <div className={`flex-1 flex flex-col ${!activeChat ? 'hidden md:flex' : 'flex'} z-10`}>
        {activeChat && socket ? (
          <ChatWindow 
            chat={activeChat} 
            chatName={getChatDisplayData(activeChat).name} 
            initialMessages={allMessages[activeChat.id] || []} 
            onBack={() => setActiveChat(null)} 
            socket={socket} 
            currentUser={currentUser} 
            allUsers={allUsers}
            chats={chats}
            onSwitchChat={(newChat) => setActiveChat(newChat)}
            wallpaper={wallpaper} 
            userStatuses={userStatuses}
            onStartCall={startCall}
            callVolume={callVolume}
          />
        ) : (
          <div className="flex-1 flex items-center justify-center bg-[#f0f2f5]"><span className="bg-white/60 px-5 py-2 rounded-full text-[15px] font-medium text-gray-500 shadow-sm backdrop-blur-sm">Выберите чат</span></div>
        )}
      </div>
    </div>
  );
}