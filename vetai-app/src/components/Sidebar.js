// src/components/Sidebar.js
import React, { useState } from 'react';
import PropTypes from 'prop-types';
import './Sidebar.css';

function groupConversationsByDate(conversations) {
  const groups = {};
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  conversations.forEach(chat => {
    // Handle both Firestore Timestamp and regular Date objects
    let date;
    if (chat.updatedAt?.toDate) {
      date = chat.updatedAt.toDate();
    } else if (chat.createdAt?.toDate) {
      date = chat.createdAt.toDate();
    } else {
      date = chat.updatedAt || chat.createdAt || new Date();
    }

    let groupKey;
    if (!(date instanceof Date) || isNaN(date)) {
      groupKey = 'Undated';
    } else if (date.toDateString() === today.toDateString()) {
      groupKey = 'Today';
    } else if (date.toDateString() === yesterday.toDateString()) {
      groupKey = 'Yesterday';
    } else {
      groupKey = date.toLocaleDateString('en-US', { 
        month: 'long', 
        day: 'numeric',
        year: 'numeric'
      });
    }

    if (!groups[groupKey]) {
      groups[groupKey] = [];
    }
    groups[groupKey].push(chat);
  });

  // Sort conversations within each group by date (most recent first)
  Object.keys(groups).forEach(key => {
    groups[key].sort((a, b) => {
      let dateA = a.updatedAt?.toDate?.() || a.createdAt?.toDate?.() || a.updatedAt || a.createdAt || new Date();
      let dateB = b.updatedAt?.toDate?.() || b.createdAt?.toDate?.() || b.updatedAt || b.createdAt || new Date();
      
      if (!(dateA instanceof Date)) dateA = new Date(dateA);
      if (!(dateB instanceof Date)) dateB = new Date(dateB);
      
      return dateB - dateA;
    });
  });

  // Get all group keys and sort them
  const sortedGroups = Object.keys(groups).sort((a, b) => {
    if (a === 'Today') return -1;
    if (b === 'Today') return 1;
    if (a === 'Yesterday') return -1;
    if (b === 'Yesterday') return 1;
    if (a === 'Undated') return 1;
    if (b === 'Undated') return -1;

    const dateA = new Date(a);
    const dateB = new Date(b);
    return dateB - dateA;
  });

  return { groups, sortedGroups };
}

function Sidebar({ 
  conversations = [], 
  onSelectConversation, 
  onNewChat, 
  selectedId,
  onLogout,
  isLoading = false 
}) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchExpanded, setIsSearchExpanded] = useState(false);

  const handleKeyPress = (event, chatId) => {
    if (event.key === 'Enter' || event.key === ' ') {
      onSelectConversation(chatId);
    }
  };

  const filteredConversations = conversations.filter(chat => 
    chat.title?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const { groups, sortedGroups } = groupConversationsByDate(filteredConversations);

  return (
    <div className={`sidebar ${isCollapsed ? 'collapsed' : ''}`}>
      <div className="sidebar-header">
        {isCollapsed ? (
          <button 
            className="icon-button collapse-button"
            onClick={() => setIsCollapsed(false)}
            aria-label="Open sidebar"
            data-tooltip="Open sidebar"
            data-shortcut="Ctrl O"
          >
            {/* Using emoji in CSS */}
          </button>
        ) : (
          <>
            <button 
              className="icon-button new-chat-icon"
              onClick={onNewChat}
              disabled={isLoading}
              aria-label="New chat"
              data-tooltip="New chat"
              data-shortcut="Ctrl N"
            >
              +
            </button>

            <div className={`search-container ${isSearchExpanded ? 'expanded' : ''}`}>
              {isSearchExpanded ? (
                <input
                  type="text"
                  placeholder="Search conversation ..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="search-input"
                  autoFocus
                  onBlur={() => {
                    if (!searchQuery) {
                      setIsSearchExpanded(false);
                    }
                  }}
                />
              ) : (
                <button
                  className="icon-button search-icon"
                  onClick={() => setIsSearchExpanded(true)}
                  aria-label="Search conversations"
                  data-tooltip="Search chats"
                  data-shortcut="Ctrl K"
                >
                  🔍
                </button>
              )}
            </div>

            <button 
              className="icon-button collapse-button"
              onClick={() => setIsCollapsed(true)}
              aria-label="Close sidebar"
              data-tooltip="Close sidebar"
              data-shortcut="Ctrl C"
            >
              {/* Using emoji in CSS */}
            </button>
          </>
        )}
      </div>
      
      {!isCollapsed && (
        <>
          <div className="conversation-list">
            {filteredConversations.length === 0 ? (
              <div className="no-conversations">
                {searchQuery ? 'No matching conversations' : 'No conversations yet'}
              </div>
            ) : (
              sortedGroups.map(groupKey => (
                <div key={groupKey} className="conversation-group">
                  <div className="conversation-date-header">
                    {groupKey}
                  </div>
                  {groups[groupKey].map((chat) => (
                    <div
                      key={chat.id}
                      className={`conversation-title ${chat.id === selectedId ? 'active' : ''}`}
                      onClick={() => onSelectConversation(chat.id)}
                      onKeyPress={(e) => handleKeyPress(e, chat.id)}
                      tabIndex={0}
                      role="button"
                      aria-pressed={chat.id === selectedId}
                    >
                      <span className="conversation-text">
                        {chat.title || 'Untitled'}
                      </span>
                    </div>
                  ))}
                </div>
              ))
            )}
          </div>
          <button 
            className="logout-sidebar-btn" 
            onClick={onLogout}
          >
            Logout
          </button>
        </>
      )}
    </div>
  );
}

Sidebar.propTypes = {
  conversations: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
      title: PropTypes.string,
      updatedAt: PropTypes.object,
      createdAt: PropTypes.object
    })
  ),
  onSelectConversation: PropTypes.func.isRequired,
  onNewChat: PropTypes.func.isRequired,
  onLogout: PropTypes.func.isRequired,
  selectedId: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  isLoading: PropTypes.bool
};

export default Sidebar;
