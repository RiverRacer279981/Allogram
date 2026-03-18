'use client';

import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, Send, Mic, Video, Paperclip, Play, Pause, FileText, X, MessageCircle, Phone, UserPlus, ChevronLeft, ChevronRight, MoreVertical, Shield, ShieldAlert, ShieldCheck, UserMinus, CornerUpRight, Pencil, Forward, Lock, Clock, CheckCheck, Check } from 'lucide-react';

const Portal = ({ children }) => {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted ? createPortal(children, document.body) : null;
};

const encryptText = (text, key) => {
  let result = '';
  for (let i = 0; i < text.length; i++) result += String.fromCharCode(text.charCodeAt(i) ^ key.charCodeAt(i % key.length));
  return btoa(encodeURIComponent(result));
};

const decryptText = (encoded, key) => {
  try {
    let text = decodeURIComponent(atob(encoded));
    let result = '';
    for (let i = 0; i < text.length; i++) result += String.fromCharCode(text.charCodeAt(i) ^ key.charCodeAt(i % key.length));
    return result;
  } catch(e) { return encoded; }
};

const getMediaPreview = (msg) => {
  if (!msg) return '';
  if (msg.type === 'text') return decryptText(msg.content, `ALLOGRAM_E2EE_${msg.chatId}`);
  if (msg.type === 'audio') return '🎤 Голосовое сообщение';
  if (msg.type === 'video') return '📹 Видеосообщение';
  if (msg.type === 'image' || msg.type === 'image_gallery') return '🖼️ Фотография';
  return '📎 Файл';
};

const TelegramAudioPlayer = ({ src, isMe, callVolume, status }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const audioRef = useRef(null);

  const isUploading = status === 'loading';
  const formatTime = (time) => { if (isNaN(time)) return "0:00"; const m = Math.floor(time / 60); const s = Math.floor(time % 60); return `${m}:${s < 10 ? '0' : ''}${s}`; };
  const togglePlay = () => { if(isUploading) return; isPlaying ? audioRef.current.pause() : audioRef.current.play(); setIsPlaying(!isPlaying); };
  const handleTimeUpdate = () => { setCurrentTime(audioRef.current.currentTime); setProgress((audioRef.current.currentTime / audioRef.current.duration) * 100); };
  const handleLoadedMetadata = () => setDuration(audioRef.current.duration);
  const handleEnded = () => { setIsPlaying(false); setProgress(0); setCurrentTime(0); };

  useEffect(() => { if (audioRef.current && callVolume !== undefined) audioRef.current.volume = callVolume; }, [callVolume]);

  return (
    <div className={`flex items-center gap-3 w-64 pt-1 pb-1 px-1 transition-opacity ${isUploading ? 'opacity-70 pointer-events-none' : ''}`}>
      <button onClick={togglePlay} disabled={isUploading} className="w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 shadow-sm transition-transform active:scale-95 bg-blue-500 text-white relative">
        {isUploading ? <div className="w-5 h-5 border-[2.5px] border-white/30 border-t-white rounded-full animate-spin"></div> : (isPlaying ? <Pause size={20} className="fill-current" /> : <Play size={20} className="ml-1 fill-current" />)}
      </button>
      <div className="flex-1 flex flex-col justify-center cursor-pointer">
        <div className={`w-full h-[4px] rounded-full relative ${isMe ? 'bg-[#bde096]' : 'bg-gray-200'}`}>
          <div className="absolute top-0 left-0 h-full rounded-full bg-blue-500 transition-all duration-75" style={{ width: `${progress}%` }}>
             <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-blue-500 rounded-full shadow-md border-2 border-white transform translate-x-1/2"></div>
          </div>
        </div>
        <div className={`flex justify-between mt-1.5 text-[11px] font-medium ${isMe ? 'text-green-800' : 'text-gray-500'}`}>
          <span>{formatTime(currentTime)}</span><span>{isUploading ? 'Загрузка...' : formatTime(duration)}</span>
        </div>
      </div>
      <audio ref={audioRef} src={src} onTimeUpdate={handleTimeUpdate} onLoadedMetadata={handleLoadedMetadata} onEnded={handleEnded} className="hidden" />
    </div>
  );
};

const SmartVideoCircle = ({ src, status }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const isUploading = status === 'loading';
  return (
    <div className="relative mt-1">
      <div className={`w-48 h-48 sm:w-56 sm:h-56 rounded-full overflow-hidden border-2 border-white shadow-md bg-black transition-all ${isExpanded ? 'opacity-0' : 'opacity-100'} ${isUploading ? 'blur-sm scale-[1.02] cursor-default opacity-90' : 'cursor-pointer hover:shadow-lg'}`} onClick={() => !isUploading && setIsExpanded(true)}>
        <video src={src} autoPlay loop muted playsInline className="w-full h-full object-cover pointer-events-none" />
      </div>
      {isUploading && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
          <div className="w-12 h-12 bg-black/40 rounded-full flex items-center justify-center backdrop-blur-sm shadow-lg">
            <div className="w-6 h-6 border-[3px] border-white/30 border-t-white rounded-full animate-spin"></div>
          </div>
        </div>
      )}
      {isExpanded && !isUploading && (
        <Portal>
          <div className="fixed inset-0 z-[9999] pointer-events-none flex items-start justify-end md:p-8 p-4">
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm pointer-events-auto transition-opacity" onClick={() => setIsExpanded(false)}></div>
            <div className="relative w-64 h-64 md:w-80 md:h-80 rounded-full overflow-hidden shadow-2xl pointer-events-auto cursor-pointer animate-in zoom-in duration-300" onClick={(e) => { e.stopPropagation(); setIsExpanded(false); }}>
              <video src={src} autoPlay loop playsInline className="w-full h-full object-cover pointer-events-none" />
            </div>
          </div>
        </Portal>
      )}
    </div>
  );
};

const ImageGallery = ({ imagesStr, status }) => {
  const images = JSON.parse(imagesStr);
  const [isOpen, setIsOpen] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  
  const isUploading = status === 'loading';
  const openFullscreen = (idx) => { if(!isUploading) { setCurrentIndex(idx); setIsOpen(true); } };
  const next = (e) => { e.stopPropagation(); setCurrentIndex(c => (c < images.length - 1 ? c + 1 : 0)); };
  const prev = (e) => { e.stopPropagation(); setCurrentIndex(c => (c > 0 ? c - 1 : images.length - 1)); };

  const singleImgClass = `w-full max-w-xs max-h-80 object-cover transition-all duration-700 ease-out ${isUploading ? 'blur-md scale-110 opacity-80 cursor-default' : 'cursor-pointer hover:opacity-90 blur-0 scale-100 opacity-100'}`;
  const gridImgClass = `w-full h-full object-cover transition-all duration-700 ease-out ${isUploading ? 'blur-md scale-110 opacity-80 cursor-default' : 'cursor-pointer hover:opacity-90 blur-0 scale-100 opacity-100'}`;

  return (
    <div className="relative mt-1">
      <div className={`overflow-hidden ${images.length === 1 ? 'rounded-xl' : 'rounded-xl w-60 h-60 sm:w-72 sm:h-72 bg-white/20'}`}>
        {images.length === 1 && <img src={images[0]} onClick={() => openFullscreen(0)} className={singleImgClass} alt="gallery" />}
        {images.length === 2 && (
          <div className="flex w-full h-full gap-0.5">
             <img src={images[0]} onClick={() => openFullscreen(0)} className={`w-1/2 ${gridImgClass}`} alt="img1" />
             <img src={images[1]} onClick={() => openFullscreen(1)} className={`w-1/2 ${gridImgClass}`} alt="img2" />
          </div>
        )}
        {images.length === 3 && (
          <div className="grid grid-cols-2 grid-rows-2 w-full h-full gap-0.5">
             <img src={images[0]} onClick={() => openFullscreen(0)} className={`col-span-2 row-span-1 ${gridImgClass}`} alt="img1" />
             <img src={images[1]} onClick={() => openFullscreen(1)} className={gridImgClass} alt="img2" />
             <img src={images[2]} onClick={() => openFullscreen(2)} className={gridImgClass} alt="img3" />
          </div>
        )}
        {images.length >= 4 && (
          <div className="grid grid-cols-2 grid-rows-2 w-full h-full gap-0.5">
             <img src={images[0]} onClick={() => openFullscreen(0)} className={gridImgClass} alt="img1" />
             <img src={images[1]} onClick={() => openFullscreen(1)} className={gridImgClass} alt="img2" />
             <img src={images[2]} onClick={() => openFullscreen(2)} className={gridImgClass} alt="img3" />
             <div className="relative w-full h-full cursor-pointer hover:opacity-90" onClick={() => openFullscreen(3)}>
               <img src={images[3]} className={gridImgClass} alt="img4" />
               {images.length > 4 && <div className="absolute inset-0 bg-black/60 flex items-center justify-center text-white text-3xl font-bold backdrop-blur-[2px]">+{images.length - 4}</div>}
             </div>
          </div>
        )}
      </div>

      {isUploading && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
          <div className="w-12 h-12 bg-black/40 rounded-full flex items-center justify-center backdrop-blur-sm shadow-lg">
            <div className="w-6 h-6 border-[3px] border-white/30 border-t-white rounded-full animate-spin"></div>
          </div>
        </div>
      )}

      {isOpen && (
        <Portal>
          <div className="fixed inset-0 z-[9999] bg-black/90 flex items-center justify-center backdrop-blur-md animate-in fade-in duration-200" onClick={() => setIsOpen(false)}>
            <button onClick={() => setIsOpen(false)} className="absolute top-6 right-6 text-white/50 hover:text-white p-2 bg-white/10 rounded-full transition-colors z-10"><X size={24} /></button>
            {images.length > 1 && <button onClick={prev} className="absolute left-4 md:left-8 text-white p-3 bg-white/10 hover:bg-white/20 rounded-full transition-colors z-10"><ChevronLeft size={32} /></button>}
            <img src={images[currentIndex]} className="max-w-[90vw] max-h-[90vh] object-contain cursor-default drop-shadow-2xl rounded-sm" onClick={e => e.stopPropagation()} alt="fullscreen" />
            {images.length > 1 && <button onClick={next} className="absolute right-4 md:right-8 text-white p-3 bg-white/10 hover:bg-white/20 rounded-full transition-colors z-10"><ChevronRight size={32} /></button>}
            {images.length > 1 && <div className="absolute bottom-6 left-1/2 -translate-x-1/2 text-white/70 font-medium text-sm bg-black/50 px-4 py-1.5 rounded-full backdrop-blur-sm">{currentIndex + 1} из {images.length}</div>}
          </div>
        </Portal>
      )}
    </div>
  );
};

export default function ChatWindow({ chat, chatName, initialMessages, onBack, socket, currentUser, allUsers, chats, onSwitchChat, wallpaper, userStatuses, onStartCall, callVolume }) {
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  
  const [replyingTo, setReplyingTo] = useState(null);
  const [editingMessage, setEditingMessage] = useState(null);
  const [contextMenu, setContextMenu] = useState(null);
  const [forwardingMessage, setForwardingMessage] = useState(null);

  const [isRecording, setIsRecording] = useState(false);
  const [recordType, setRecordType] = useState(null); 
  const [selectedUserProfile, setSelectedUserProfile] = useState(null);
  const [isAddUserModalOpen, setIsAddUserModalOpen] = useState(false);
  const [isGroupInfoModalOpen, setIsGroupInfoModalOpen] = useState(false);

  const secretKey = `ALLOGRAM_E2EE_${chat.id}`;

  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const streamRef = useRef(null);
  const recordStartTimeRef = useRef(0);
  const isCancelledRef = useRef(false);
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (socket) socket.emit('set_active_chat', chat.id);
    return () => { if (socket) socket.emit('set_active_chat', null); };
  }, [socket, chat.id]);

  const processMessages = (msgs) => msgs.map(msg => {
    if ((msg.type === 'audio' || msg.type === 'video' || msg.type === 'image' || msg.type === 'image_gallery' || msg.type === 'file') && !msg.displayContent) {
      if (msg.content instanceof ArrayBuffer) {
        const blob = new Blob([msg.content], { type: msg.type === 'video' ? 'video/webm' : 'audio/webm' });
        return { ...msg, displayContent: URL.createObjectURL(blob) };
      }
      return { ...msg, displayContent: msg.content };
    }
    return msg;
  });

  useEffect(() => { 
    setMessages(prev => {
      const processed = processMessages(initialMessages);
      const loading = prev.filter(m => m.status === 'loading');
      return [...processed, ...loading.filter(l => !processed.some(p => p.id === l.id))].sort((a,b) => a.id - b.id);
    }); 
  }, [chat.id, initialMessages]);

  useEffect(() => {
    if (!socket || !chat.id || !currentUser || messages.length === 0) return;
    const unreadIds = messages
      .filter(m => m.senderEmail !== currentUser.email && (!m.readBy || !m.readBy.includes(currentUser.email)))
      .map(m => m.id);
      
    if (unreadIds.length > 0) {
       socket.emit('mark_read', { chatId: chat.id, messageIds: unreadIds, userEmail: currentUser.email });
       setMessages(prev => prev.map(m => unreadIds.includes(m.id) ? { ...m, readBy: [...new Set([...(m.readBy||[]), currentUser.email])] } : m));
    }
  }, [messages, socket, chat.id, currentUser]);

  const sendMessage = (type, content, fileName = '') => {
    if (type === 'text' && !content.trim()) return;
    
    if (editingMessage && type === 'text') {
      const encryptedContent = encryptText(content, secretKey);
      socket.emit('edit_message', { chatId: chat.id, msgId: editingMessage.id, newContent: encryptedContent, requesterEmail: currentUser.email });
      setEditingMessage(null); setInputText(''); return;
    }

    const payloadContent = type === 'text' ? encryptText(content, secretKey) : content;
    let replyPayload = null;
    if (replyingTo) {
      replyPayload = { 
        id: replyingTo.id, 
        senderName: replyingTo.senderName, 
        preview: getMediaPreview({ ...replyingTo, chatId: chat.id }) 
      };
    }

    socket.emit('send_message', { chatId: chat.id, id: Date.now(), type, content: payloadContent, fileName, replyTo: replyPayload, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) });
    if (type === 'text') setInputText('');
    setReplyingTo(null);
  };

  const scrollToMessage = (id) => {
    const el = document.getElementById(`msg-wrapper-${id}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      const bubble = el.querySelector('.message-bubble');
      if (bubble) {
        bubble.classList.add('brightness-90', 'scale-[1.02]');
        setTimeout(() => bubble.classList.remove('brightness-90', 'scale-[1.02]'), 1000);
      }
    }
  };

  const handleFileUpload = async (e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;
    
    const imageFiles = files.filter(f => f.type.startsWith('image/'));
    const otherFiles = files.filter(f => !f.type.startsWith('image/'));

    if (imageFiles.length > 0) {
      const msgId = Date.now();
      const localPreviews = imageFiles.map(file => URL.createObjectURL(file));
      
      const tempMsg = {
        id: msgId,
        chatId: chat.id,
        senderEmail: currentUser.email,
        senderName: currentUser.name,
        senderAvatar: currentUser.avatar,
        type: imageFiles.length > 1 ? 'image_gallery' : 'image',
        displayContent: imageFiles.length > 1 ? JSON.stringify(localPreviews) : localPreviews[0],
        status: 'loading', 
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        readBy: []
      };
      setMessages(prev => [...prev, tempMsg]);

      const imagePromises = imageFiles.map(file => new Promise(resolve => {
        const reader = new FileReader(); 
        reader.onloadend = () => resolve(reader.result); 
        reader.readAsDataURL(file);
      }));
      const base64Images = await Promise.all(imagePromises);
      
      await new Promise(res => setTimeout(res, 800));

      const payloadContent = imageFiles.length > 1 ? JSON.stringify(base64Images) : base64Images[0];
      socket.emit('send_message', { 
        chatId: chat.id, id: msgId, type: imageFiles.length > 1 ? 'image_gallery' : 'image', content: payloadContent, time: tempMsg.time 
      });
    }

    otherFiles.forEach(file => {
      const msgId = Date.now() + Math.random();
      const tempMsg = {
         id: msgId, chatId: chat.id, senderEmail: currentUser.email, senderName: currentUser.name,
         senderAvatar: currentUser.avatar, type: 'file', fileName: file.name, status: 'loading',
         time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
         readBy: []
      };
      setMessages(prev => [...prev, tempMsg]);

      const reader = new FileReader(); 
      reader.onloadend = () => { 
        setTimeout(() => { 
          socket.emit('send_message', { chatId: chat.id, id: msgId, type: 'file', content: reader.result, fileName: file.name, time: tempMsg.time }); 
        }, 800);
      }; 
      reader.readAsDataURL(file);
    });
    
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleContextMenu = (e, msg) => {
    e.preventDefault();
    const menuWidth = 160; 
    let x = e.pageX; let y = e.pageY;
    if (msg.senderEmail === currentUser.email) x = e.pageX - menuWidth;
    if (x < 10) x = 10;
    if (x + menuWidth > window.innerWidth) x = window.innerWidth - menuWidth - 10;
    if (y + 150 > window.innerHeight) y = window.innerHeight - 150 - 10;
    setContextMenu({ x, y, msg });
  };

  const closeContextMenu = () => setContextMenu(null);

  const handleAction = (action) => {
    if (!contextMenu) return;
    const { msg } = contextMenu;
    
    if (action === 'reply') {
      setReplyingTo(msg); setEditingMessage(null); setTimeout(() => document.getElementById('chat-input')?.focus(), 50);
    } else if (action === 'edit') {
      setEditingMessage(msg); setReplyingTo(null); setInputText(decryptText(msg.content, secretKey)); setTimeout(() => document.getElementById('chat-input')?.focus(), 50);
    } else if (action === 'forward') {
      setForwardingMessage(msg);
    }
    closeContextMenu();
  };

  const handleForwardSelectChat = (targetChat) => {
    if (!forwardingMessage) return;
    let payloadContent = forwardingMessage.content; 
    if (forwardingMessage.type === 'text') {
      const decryptedText = decryptText(forwardingMessage.content, secretKey);
      const targetSecretKey = `ALLOGRAM_E2EE_${targetChat.id}`;
      payloadContent = encryptText(decryptedText, targetSecretKey);
    }
    
    socket.emit('send_message', { 
      chatId: targetChat.id, 
      id: Date.now(), 
      type: forwardingMessage.type, 
      content: payloadContent, 
      fileName: forwardingMessage.fileName, 
      isForwarded: true, 
      forwardedFrom: forwardingMessage.senderName, 
      originalChatId: chat.type === 'group' ? chat.id : null, 
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) 
    });
    
    setForwardingMessage(null);
    onSwitchChat(targetChat);
  };

  const handleStartPrivateChat = () => { if (!selectedUserProfile) return; socket.emit('start_private_chat', { email: selectedUserProfile.email, name: selectedUserProfile.name, avatar: selectedUserProfile.avatar }, (response) => { if (response.success) { setSelectedUserProfile(null); onSwitchChat(response.chat); } }); };
  const handleAddUserToGroup = (userEmail) => { socket.emit('add_to_group', { chatId: chat.id, userEmail }, (response) => { if (response.success) setIsAddUserModalOpen(false); else alert(response.error); }); };
  const handleRemoveMember = (email) => { socket.emit('remove_from_group', { chatId: chat.id, userEmail: email, requesterEmail: currentUser.email }, (res) => { if (!res.success) alert(res.error); }); };
  const handleUpdateRole = (email, newRole) => { socket.emit('update_role', { chatId: chat.id, userEmail: email, newRole, requesterEmail: currentUser.email }, (res) => { if (!res.success) alert(res.error); }); };
  const handleDeleteGroup = () => { if (window.confirm('Вы уверены, что хотите удалить эту группу? Все сообщения будут стерты у всех участников.')) { socket.emit('delete_chat', { chatId: chat.id, requesterEmail: currentUser.email }); setIsGroupInfoModalOpen(false); } };

  const handleHeaderClick = () => {
    if (chat.type === 'private') { const otherUser = chat.members.find(m => m.email !== currentUser.email); if (otherUser) setSelectedUserProfile(otherUser); }
    else if (chat.type === 'group' && !chat.isGlobal) setIsGroupInfoModalOpen(true);
  };

  const startRecording = async (type) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: type === 'video' });
      streamRef.current = stream; setRecordType(type); setIsRecording(true); isCancelledRef.current = false; recordStartTimeRef.current = Date.now();
      const mediaRecorder = new MediaRecorder(stream); mediaRecorderRef.current = mediaRecorder; chunksRef.current = [];
      mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      
      mediaRecorder.onstop = () => {
        stream.getTracks().forEach(track => track.stop()); streamRef.current = null;
        if (isCancelledRef.current) return;
        
        const blob = new Blob(chunksRef.current, { type: type === 'video' ? 'video/webm' : 'audio/webm' });
        
        const localUrl = URL.createObjectURL(blob);
        const msgId = Date.now();
        const tempMsg = {
           id: msgId, chatId: chat.id, senderEmail: currentUser.email, senderName: currentUser.name,
           senderAvatar: currentUser.avatar, type, displayContent: localUrl, status: 'loading',
           time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), readBy: []
        };
        setMessages(prev => [...prev, tempMsg]);

        const reader = new FileReader(); 
        reader.onloadend = () => { 
          setTimeout(() => { 
             socket.emit('send_message', { chatId: chat.id, id: msgId, type, content: reader.result, time: tempMsg.time }); 
          }, 800);
        }; 
        reader.readAsDataURL(blob);
      };
      mediaRecorder.start();
    } catch (err) { alert('Нужен доступ к камере/микрофону'); }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      if (Date.now() - recordStartTimeRef.current < 1000) { alert('Сообщение слишком короткое.'); isCancelledRef.current = true; }
      mediaRecorderRef.current.stop(); setIsRecording(false); setRecordType(null);
    }
  };

  const availableUsersToAdd = allUsers?.filter(u => chats?.filter(c => c.type === 'private' && c.members?.some(m => m.email === currentUser.email)).map(c => c.members?.find(m => m.email !== currentUser.email)?.email).filter(Boolean).includes(u.email) && !chat.members?.some(m => m.email === u.email));
  let statusText = `${chat.members?.length || 0} участников`;
  if (chat.type === 'private') {
    const otherUser = chat.members.find(m => m.email !== currentUser.email) || chat.members[0];
    const status = userStatuses && userStatuses[otherUser.email];
    if (status) statusText = status.activeChat === chat.id ? 'в сети' : 'был(а) недавно';
    else statusText = 'был(а) недавно';
  }
  const amIAdmin = chat.members?.find(m => m.email === currentUser.email)?.role === 'admin';

  return (
    <div className="flex flex-col w-full h-full flex-1 relative font-sans overflow-hidden bg-white">
      
      {contextMenu && (
        <Portal>
          <div className="fixed inset-0 z-[10000]" onClick={closeContextMenu} onContextMenu={(e) => { e.preventDefault(); closeContextMenu(); }}>
            <div className="absolute bg-white rounded-xl shadow-2xl py-1 border border-gray-100 min-w-[160px] animate-in fade-in zoom-in-95 duration-100" style={{ top: contextMenu.y, left: contextMenu.x }} onClick={e => e.stopPropagation()}>
              <button onClick={() => handleAction('reply')} className="w-full text-left px-4 py-2 hover:bg-gray-50 flex items-center gap-3 text-sm text-gray-800 transition-colors"><CornerUpRight size={16} className="text-gray-500" /> Ответить</button>
              {contextMenu.msg.senderEmail === currentUser.email && contextMenu.msg.type === 'text' && (<button onClick={() => handleAction('edit')} className="w-full text-left px-4 py-2 hover:bg-gray-50 flex items-center gap-3 text-sm text-gray-800 transition-colors"><Pencil size={16} className="text-gray-500" /> Изменить</button>)}
              {!contextMenu.msg.isForwarded && (<button onClick={() => handleAction('forward')} className="w-full text-left px-4 py-2 hover:bg-gray-50 flex items-center gap-3 text-sm text-gray-800 transition-colors border-t border-gray-100 mt-1 pt-2"><Forward size={16} className="text-gray-500" /> Переслать</button>)}
            </div>
          </div>
        </Portal>
      )}

      {forwardingMessage && (
        <Portal>
          <div className="fixed inset-0 z-[10000] bg-black/50 backdrop-blur-sm flex items-center justify-center" onClick={() => setForwardingMessage(null)}>
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in duration-200" onClick={e => e.stopPropagation()}>
              <div className="flex justify-between items-center p-4 border-b"><h2 className="text-lg font-semibold text-gray-800">Переслать</h2><button onClick={() => setForwardingMessage(null)} className="p-1.5 hover:bg-gray-100 rounded-full"><X size={20} /></button></div>
              <div className="p-2 max-h-80 overflow-y-auto">
                {(() => {
                  const availableForwardChats = chats.filter(c => c.id !== chat.id && (c.isGlobal || c.members?.some(m => m.email === currentUser.email)));
                  if (availableForwardChats.length === 0) return (<div className="p-6 text-center text-gray-500"><p className="text-[15px] font-semibold text-gray-700 mb-1">Нет других чатов</p><p className="text-sm">Вам пока некому переслать это сообщение.</p></div>);
                  return availableForwardChats.map(c => {
                    const name = c.type === 'private' ? (c.members.find(m => m.email !== currentUser.email)?.name || c.name) : c.name;
                    const avatar = c.type === 'private' ? c.members.find(m => m.email !== currentUser.email)?.avatar : null;
                    return (
                      <div key={c.id} onClick={() => handleForwardSelectChat(c)} className="flex items-center gap-3 p-3 hover:bg-blue-50 cursor-pointer rounded-xl transition-colors">
                        <div className="w-12 h-12 rounded-full bg-gradient-to-tr from-blue-400 to-blue-600 overflow-hidden flex items-center justify-center text-white font-bold">{avatar ? <img src={avatar} className="w-full h-full object-cover" /> : name.substring(0, 2).toUpperCase()}</div>
                        <h3 className="text-[15px] font-semibold text-gray-900">{name}</h3>
                      </div>
                    )
                  });
                })()}
              </div>
            </div>
          </div>
        </Portal>
      )}

      {isRecording && recordType === 'video' && (
         <Portal>
           <div className="fixed top-4 right-4 md:top-8 md:right-8 z-[9999] animate-in fade-in slide-in-from-top-4 slide-in-from-right-4 duration-300">
             <div className="absolute -inset-2 bg-red-500/40 rounded-full animate-pulse z-0"></div>
             <video ref={(node) => { if (node && streamRef.current) node.srcObject = streamRef.current; }} autoPlay muted className="w-64 h-64 md:w-80 md:h-80 rounded-full object-cover border-4 border-red-500 shadow-2xl scale-x-[-1] relative z-10" />
           </div>
         </Portal>
      )}

      {/* ШАПКА - Жестко приклеена к верху */}
      <div className="flex items-center p-2.5 border-b bg-white z-20 shadow-sm flex-shrink-0">
        <button onClick={onBack} className="md:hidden p-2 mr-1 rounded-full hover:bg-gray-100 transition-colors"><ArrowLeft size={24} /></button>
        <div className={`flex-1 ml-2 ${(chat.type === 'private' || (chat.type === 'group' && !chat.isGlobal)) ? 'cursor-pointer hover:opacity-80 transition-opacity' : ''}`} onClick={handleHeaderClick}>
          <h2 className="font-semibold text-[17px] text-gray-900 leading-tight">{chatName}</h2>
          <p className={`text-[13px] font-medium transition-colors ${statusText === 'в сети' ? 'text-blue-500' : 'text-gray-500'}`}>{statusText}</p>
        </div>
        <div className="flex items-center gap-1 sm:gap-2">
           {chat.type === 'group' && !chat.isGlobal && <button onClick={() => setIsAddUserModalOpen(true)} className="p-2 text-gray-500 hover:bg-gray-100 rounded-full transition-colors"><UserPlus size={20} /></button>}
           {chat.type === 'private' && (
             <>
               <button onClick={() => { const otherUser = chat.members.find(m => m.email !== currentUser.email); if (otherUser) onStartCall(otherUser, false); }} className="p-2 text-gray-500 hover:text-blue-500 hover:bg-blue-50 rounded-full transition-colors"><Phone size={20} /></button>
               <button onClick={() => { const otherUser = chat.members.find(m => m.email !== currentUser.email); if (otherUser) onStartCall(otherUser, true); }} className="p-2 text-gray-500 hover:text-blue-500 hover:bg-blue-50 rounded-full transition-colors"><Video size={20} /></button>
               <button className="p-2 text-gray-500 hover:bg-gray-100 rounded-full transition-colors"><MoreVertical size={20} /></button>
             </>
           )}
        </div>
      </div>

      <div 
        className="flex-1 overflow-y-auto p-4 flex flex-col gap-3 relative z-0" 
        style={{ backgroundColor: wallpaper?.bgColor || '#8ea1a5', backgroundImage: wallpaper?.bgImage || 'none', backgroundBlendMode: wallpaper?.blend || 'normal', backgroundSize: wallpaper?.bgSize || 'cover', backgroundPosition: wallpaper?.bgPos || 'center', backgroundAttachment: 'fixed' }}
      >
        {messages.map((msg) => {
          const isMe = msg.senderEmail === currentUser.email;
          return (
            <div key={msg.id} id={`msg-wrapper-${msg.id}`} onContextMenu={(e) => handleContextMenu(e, msg)} className={`max-w-[85%] md:max-w-[70%] p-2.5 shadow-sm flex flex-col relative transition-all cursor-context-menu hover:shadow-md message-bubble ${isMe ? 'bg-[#eeffde] self-end rounded-2xl rounded-br-none' : 'bg-white self-start rounded-2xl rounded-bl-none'}`}>
              {msg.isForwarded && (<div className={`flex items-center gap-1.5 text-blue-500 mb-1.5 text-xs font-medium ${msg.originalChatId ? 'cursor-pointer hover:underline' : ''}`} onClick={() => { if (msg.originalChatId) { const target = chats?.find(c => c.id === msg.originalChatId); if (target) onSwitchChat(target); else alert("Этот чат недоступен или был удален"); } }}><Forward size={14} /> Переслано от {msg.forwardedFrom}</div>)}
              {msg.replyTo && (<div onClick={() => scrollToMessage(msg.replyTo.id)} className="flex flex-col border-l-2 border-blue-500 pl-2 mb-1.5 bg-blue-500/5 hover:bg-blue-500/10 rounded-r-md py-1 cursor-pointer transition-colors"><span className="text-blue-500 text-[12px] font-bold leading-tight">{msg.replyTo.senderName}</span><span className="text-gray-600 text-[13px] truncate leading-tight">{msg.replyTo.preview || 'Отвеченное сообщение'}</span></div>)}
              {!isMe && chat.type !== 'private' && (<div className="flex items-center gap-2 mb-1.5 ml-1 cursor-pointer hover:opacity-80 transition-opacity w-fit" onClick={() => setSelectedUserProfile({ name: msg.senderName, email: msg.senderEmail, avatar: msg.senderAvatar })}><div className="w-6 h-6 rounded-full bg-blue-100 overflow-hidden flex items-center justify-center text-[10px] text-blue-500 font-bold">{msg.senderAvatar ? <img src={msg.senderAvatar} className="w-full h-full object-cover" /> : msg.senderName.charAt(0).toUpperCase()}</div><span className="text-[13px] font-semibold text-blue-500 hover:underline">{msg.senderName}</span></div>)}
              {msg.type === 'text' && <p className="text-[15px] px-1 text-gray-900 leading-snug break-words">{decryptText(msg.content, secretKey)}</p>}
              {msg.type === 'image' && <ImageGallery imagesStr={JSON.stringify([msg.displayContent || msg.content])} status={msg.status} />}
              {msg.type === 'image_gallery' && <ImageGallery imagesStr={msg.displayContent || msg.content} status={msg.status} />}
              {msg.type === 'file' && (<div className={`flex items-center gap-3 p-3 rounded-xl mt-1 transition-opacity ${isMe ? 'bg-[#d6f0ba]' : 'bg-gray-100'} ${msg.status === 'loading' ? 'opacity-60' : 'opacity-100'}`}><div className="w-10 h-10 bg-blue-500 rounded-full flex items-center justify-center text-white flex-shrink-0">{msg.status === 'loading' ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div> : <FileText size={20} />}</div><div className="overflow-hidden"><p className="text-[14px] font-medium text-gray-900 truncate">{msg.fileName || 'Документ'}</p><p className="text-[12px] text-gray-500">Файл</p></div></div>)}
              {msg.type === 'audio' && <TelegramAudioPlayer src={msg.displayContent || msg.content} isMe={isMe} callVolume={callVolume} status={msg.status} />}
              {msg.type === 'video' && <SmartVideoCircle src={msg.displayContent || msg.content} status={msg.status} />}
              
              <div className="flex items-center justify-end gap-1 mt-1.5 ml-3 text-[11px] text-gray-400">
                {msg.isEdited && <span className="font-medium italic mr-1">изменено</span>}
                <span className="font-medium">{msg.time}</span>
                {isMe && (msg.status === 'loading' ? <Clock size={12} className="opacity-70 ml-0.5" /> : (msg.readBy && msg.readBy.length > 0 ? <CheckCheck size={14} className="text-blue-500 ml-0.5" /> : <Check size={14} className="text-gray-400 ml-0.5" />))}
              </div>
            </div>
          );
        })}
        <div className="mt-auto pt-8 pb-2 flex justify-center w-full"><span className="text-[11px] font-medium text-gray-500/80 bg-white/50 backdrop-blur-md px-4 py-1.5 rounded-full flex items-center gap-1.5 shadow-sm border border-white/20"><Lock size={12} className="text-gray-400/80" /> Защищено сквозным шифрованием</span></div>
      </div>

      {/* ПОДВАЛ (Поле ввода) - Жестко приклеен к низу + отступ для iPhone */}
      <div className="bg-white flex flex-col shadow-[0_-5px_20px_rgba(0,0,0,0.04)] z-20 relative flex-shrink-0 pb-[env(safe-area-inset-bottom)]">
        {(replyingTo || editingMessage) && (
          <div className="flex items-center justify-between bg-blue-50 border-l-2 border-blue-500 px-4 py-2 animate-in slide-in-from-bottom-2 duration-150">
            <div className="flex flex-col overflow-hidden">
              <span className="text-[12px] font-bold text-blue-500">{editingMessage ? 'Редактирование' : `Ответ для ${replyingTo.senderName}`}</span>
              <span className="text-[13px] text-gray-600 truncate">{editingMessage ? decryptText(editingMessage.content, secretKey) : getMediaPreview({ ...replyingTo, chatId: chat.id })}</span>
            </div>
            <button onClick={() => { setReplyingTo(null); setEditingMessage(null); setInputText(''); }} className="p-1.5 text-blue-400 hover:text-blue-600 hover:bg-blue-100 rounded-full transition-colors"><X size={18} /></button>
          </div>
        )}

        <div className="flex items-end gap-2 p-2.5">
          <button onClick={() => fileInputRef.current?.click()} className="p-3 text-gray-400 hover:text-blue-500 hover:bg-blue-50 rounded-full transition-colors"><Paperclip size={24} /></button>
          <input type="file" ref={fileInputRef} onChange={handleFileUpload} className="hidden" multiple />
          
          <div className="flex-1 bg-[#f4f4f5] rounded-2xl border border-transparent focus-within:border-blue-200 focus-within:bg-white transition-colors flex items-center mb-1">
            <textarea id="chat-input" value={inputText} onChange={(e) => setInputText(e.target.value)} placeholder="Написать сообщение..." className="w-full bg-transparent py-3 px-4 outline-none resize-none text-[16px] max-h-32 min-h-[48px]" rows={1} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage('text', inputText); } }} />
          </div>
          
          {editingMessage ? (
             <button onClick={() => sendMessage('text', inputText)} className="mb-1 p-3.5 bg-blue-500 text-white rounded-full shadow-md shadow-blue-500/30 hover:bg-blue-600 hover:scale-105 active:scale-95 transition-all"><Send size={24} className="ml-0.5" /></button>
          ) : !inputText.trim() ? (
            <div className="flex mb-1 gap-1">
              <button onClick={isRecording ? stopRecording : () => startRecording('audio')} className={`p-3.5 rounded-full transition-all duration-200 ${isRecording && recordType === 'audio' ? 'bg-red-500 text-white shadow-lg shadow-red-500/30 scale-110' : 'text-gray-500 hover:bg-gray-100 hover:text-blue-500'}`}><Mic size={24} /></button>
              <button onClick={isRecording ? stopRecording : () => startRecording('video')} className={`p-3.5 rounded-full transition-all duration-200 ${isRecording && recordType === 'video' ? 'bg-red-500 text-white shadow-lg shadow-red-500/30 scale-110' : 'text-gray-500 hover:bg-gray-100 hover:text-blue-500'}`}><Video size={24} /></button>
            </div>
          ) : (
            <button onClick={() => sendMessage('text', inputText)} className="mb-1 p-3.5 bg-blue-500 text-white rounded-full shadow-md shadow-blue-500/30 hover:bg-blue-600 hover:scale-105 active:scale-95 transition-all"><Send size={24} className="ml-0.5" /></button>
          )}
        </div>
      </div>

      {selectedUserProfile && (
        <Portal>
          <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 backdrop-blur-sm transition-opacity" onClick={() => setSelectedUserProfile(null)}>
            <div className="bg-white rounded-3xl shadow-2xl w-[320px] p-6 flex flex-col items-center animate-in zoom-in duration-200" onClick={e => e.stopPropagation()}>
              <button onClick={() => setSelectedUserProfile(null)} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 bg-gray-100 rounded-full p-1.5 transition-colors"><X size={18} /></button>
              <div className="w-28 h-28 rounded-full overflow-hidden bg-gradient-to-tr from-blue-400 to-blue-600 mb-4 flex items-center justify-center text-white text-4xl font-bold shadow-md">{selectedUserProfile.avatar ? <img src={selectedUserProfile.avatar} className="w-full h-full object-cover" /> : selectedUserProfile.name.charAt(0).toUpperCase()}</div>
              <h3 className="text-xl font-bold text-gray-900 mb-1">{selectedUserProfile.name}</h3><p className="text-[13px] text-blue-500 font-medium mb-6">{selectedUserProfile.email}</p>
              <div className="flex gap-4 w-full justify-center px-4">
                {selectedUserProfile.email !== currentUser.email && <button onClick={handleStartPrivateChat} className="flex flex-col items-center gap-1.5 text-blue-500 hover:text-blue-600 transition-colors group"><div className="w-12 h-12 rounded-full bg-blue-50 group-hover:bg-blue-100 flex items-center justify-center transition-colors"><MessageCircle size={22} className="fill-current opacity-20" /></div><span className="text-[11px] font-semibold uppercase tracking-wide">Написать</span></button>}
                {selectedUserProfile.email !== currentUser.email && <button onClick={() => { setSelectedUserProfile(null); onStartCall(selectedUserProfile, false); }} className="flex flex-col items-center gap-1.5 text-blue-500 hover:text-blue-600 transition-colors group"><div className="w-12 h-12 rounded-full bg-blue-50 group-hover:bg-blue-100 flex items-center justify-center transition-colors"><Phone size={22} className="fill-current opacity-20" /></div><span className="text-[11px] font-semibold uppercase tracking-wide">Звонок</span></button>}
                {selectedUserProfile.email !== currentUser.email && <button onClick={() => { setSelectedUserProfile(null); onStartCall(selectedUserProfile, true); }} className="flex flex-col items-center gap-1.5 text-blue-500 hover:text-blue-600 transition-colors group"><div className="w-12 h-12 rounded-full bg-blue-50 group-hover:bg-blue-100 flex items-center justify-center transition-colors"><Video size={22} className="fill-current opacity-20" /></div><span className="text-[11px] font-semibold uppercase tracking-wide">Видео</span></button>}
              </div>
            </div>
          </div>
        </Portal>
      )}

      {isGroupInfoModalOpen && (
        <Portal>
          <div className="fixed inset-0 z-[9999] bg-black/50 backdrop-blur-sm flex items-center justify-center" onClick={() => setIsGroupInfoModalOpen(false)}>
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in duration-200 flex flex-col" onClick={e => e.stopPropagation()}>
              <div className="flex justify-between items-center p-4 border-b"><h2 className="text-lg font-semibold text-gray-800">Информация о группе</h2><button onClick={() => setIsGroupInfoModalOpen(false)} className="p-1.5 hover:bg-gray-100 rounded-full"><X size={20} /></button></div>
              <div className="p-4 max-h-[50vh] overflow-y-auto">
                <div className="flex flex-col items-center mb-6"><div className="w-24 h-24 rounded-full overflow-hidden bg-gradient-to-tr from-blue-400 to-blue-600 flex items-center justify-center text-white text-3xl font-bold mb-3 shadow-md">{chat.name.substring(0, 2).toUpperCase()}</div><h3 className="text-xl font-bold text-gray-900">{chat.name}</h3><p className="text-gray-500 text-sm">{chat.members?.length || 0} участников</p></div>
                <h4 className="text-xs font-bold text-gray-400 uppercase mb-3">Участники</h4>
                <div className="flex flex-col gap-2">
                  {chat.members?.map(member => {
                     const isMe = member.email === currentUser.email;
                     return (
                       <div key={member.email} className="flex items-center justify-between p-2 hover:bg-gray-50 rounded-xl transition-colors group">
                         <div className="flex items-center gap-3"><div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-500 font-bold overflow-hidden">{member.avatar ? <img src={member.avatar} className="w-full h-full object-cover" /> : member.name.charAt(0).toUpperCase()}</div><div className="flex flex-col"><div className="flex items-center gap-1.5"><span className="font-semibold text-gray-900 text-[15px]">{member.name} {isMe && '(Вы)'}</span>{member.role === 'admin' && <Shield size={12} className="text-blue-500" title="Администратор" />}</div><span className="text-xs text-gray-500">{member.email}</span></div></div>
                         {amIAdmin && !isMe && (<div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity"><button onClick={() => handleUpdateRole(member.email, member.role === 'admin' ? 'member' : 'admin')} className={`p-2 rounded-full transition-colors ${member.role === 'admin' ? 'text-orange-500 hover:bg-orange-50' : 'text-blue-500 hover:bg-blue-50'}`}>{member.role === 'admin' ? <ShieldAlert size={18} /> : <ShieldCheck size={18} />}</button><button onClick={() => handleRemoveMember(member.email)} className="p-2 text-red-500 hover:bg-red-50 rounded-full transition-colors"><UserMinus size={18} /></button></div>)}
                       </div>
                     );
                  })}
                </div>
              </div>
              {amIAdmin && (<div className="p-4 border-t bg-red-50"><button onClick={handleDeleteGroup} className="w-full flex items-center justify-center gap-2 py-3 bg-red-500 hover:bg-red-600 text-white font-semibold rounded-xl transition-colors shadow-sm"><Trash2 size={18} /> Удалить группу</button></div>)}
            </div>
          </div>
        </Portal>
      )}

      {isAddUserModalOpen && (
        <Portal>
          <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => setIsAddUserModalOpen(false)}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden animate-in fade-in zoom-in duration-200" onClick={e => e.stopPropagation()}>
              <div className="flex justify-between items-center p-4 border-b"><h2 className="text-lg font-semibold text-gray-800">Добавить участника</h2><button onClick={() => setIsAddUserModalOpen(false)} className="p-1.5 hover:bg-gray-100 rounded-full transition-colors"><X size={20} /></button></div>
              <div className="p-2 max-h-80 overflow-y-auto">
                {availableUsersToAdd && availableUsersToAdd.length > 0 ? (availableUsersToAdd.map((user, index) => (<div key={user.email || `fallback-${index}`} onClick={() => handleAddUserToGroup(user.email)} className="flex items-center gap-3 p-3 hover:bg-blue-50 cursor-pointer rounded-xl transition-colors"><div className="w-10 h-10 rounded-full bg-blue-100 overflow-hidden flex items-center justify-center text-blue-500 font-bold">{user.avatar ? <img src={user.avatar} className="w-full h-full object-cover" /> : user.name.charAt(0).toUpperCase()}</div><div><h3 className="text-[15px] font-semibold text-gray-900">{user.name}</h3><p className="text-[12px] text-gray-500">{user.email}</p></div></div>))) : (<div className="p-6 text-center text-gray-500"><p className="text-[15px] font-semibold text-gray-700 mb-1">Нет доступных контактов</p><p className="text-sm">Вы можете добавить в группу только тех пользователей, с которыми у вас есть <span className="font-semibold text-blue-500">Личная переписка</span>.</p></div>)}
              </div>
            </div>
          </div>
        </Portal>
      )}
    </div>
  );
}