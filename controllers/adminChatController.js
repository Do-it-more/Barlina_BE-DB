const AdminChat = require('../models/AdminChat');
const AdminMessage = require('../models/AdminMessage');
const User = require('../models/User');

// @desc    Get all active chats for the current user
// @route   GET /api/admin/chat/rooms
// @access  Private (Admin/SuperAdmin)
const getChats = async (req, res) => {
    try {
        const chats = await AdminChat.find({
            "members.user": req.user._id
        })
            .populate('members.user', 'name profilePhoto role isOnline lastSeen')
            .populate({
                path: 'lastMessage',
                select: 'content contentType sender createdAt isDeletedGlobally'
            })
            .sort({ lastMessageAt: -1 });

        // Transform for UI: Calculate unread counts, correct names etc.
        const formattedChats = chats.map(chat => {
            const chatObj = chat.toObject();

            // For Private chats, figure out the "Other" user's name/photo
            if (chat.type === 'private') {
                const otherMember = chat.members.find(m => m.user._id.toString() !== req.user._id.toString());
                if (otherMember && otherMember.user) {
                    chatObj.chatName = otherMember.user.name;
                    chatObj.chatAvatar = otherMember.user.profilePhoto;
                    chatObj.partnerId = otherMember.user._id;
                    chatObj.isOnline = otherMember.user.isOnline || false; // Future proof
                } else {
                    chatObj.chatName = "Unknown User";
                }
            } else {
                // Group Chat
                chatObj.chatName = chat.groupName;
                chatObj.chatAvatar = chat.groupAvatar;
            }

            return chatObj;
        });

        res.json(formattedChats);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
};

// @desc    Get specific chat history
// @route   GET /api/admin/chat/:id/messages
// @access  Private
const getMessages = async (req, res) => {
    try {
        const chatId = req.params.id;
        const myId = req.user._id;

        // 1. Verify Membership & Get "ClearedAt" timestamp
        const chat = await AdminChat.findOne({
            _id: chatId,
            "members.user": myId
        });

        if (!chat) {
            return res.status(403).json({ message: 'Not authorized to access this chat' });
        }

        const myMemberData = chat.members.find(m => m.user.toString() === myId.toString());
        const clearedAt = myMemberData.clearedAt || new Date(0); // Default to epoch if never cleared

        // 2. Fetch Messages
        const messages = await AdminMessage.find({
            chat: chatId,
            createdAt: { $gt: clearedAt }, // Only show messages after the clear timestamp
            deletedFor: { $ne: myId }      // Don't show messages deleted by me (soft delete)
        })
            .populate('sender', 'name profilePhoto role')
            .sort({ createdAt: 1 });

        res.json(messages);

    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
};

// @desc    Send a message (Text or Multimedia)
// @route   POST /api/admin/chat/send
// @access  Private
const sendMessage = async (req, res) => {
    try {
        const { chatId, content, type } = req.body; // type: 'private' | 'group' if creating new
        const { recipientId } = req.body; // for creating new private chat implicitly

        let targetChatId = chatId;

        // A. Handle Multimedia Uploads
        let fileData = {};
        if (req.file) {
            fileData = {
                fileUrl: `/uploads/${req.file.filename}`,
                fileName: req.file.originalname,
                fileSize: req.file.size,
                contentType: req.file.mimetype.startsWith('image/') ? 'image' :
                    req.file.mimetype.startsWith('video/') ? 'video' : 'document'
            };
        }

        // B. Implicit Chat Creation (if no Chat ID provided)
        if (!targetChatId && recipientId) {
            // Check if private chat already exists
            let existingChat = await AdminChat.findOne({
                type: 'private',
                "members.user": { $all: [req.user._id, recipientId] }
            });

            if (existingChat) {
                targetChatId = existingChat._id;
            } else {
                // Create New Private Chat
                const newChat = await AdminChat.create({
                    type: 'private',
                    members: [
                        { user: req.user._id },
                        { user: recipientId }
                    ]
                });
                targetChatId = newChat._id;
            }
        }

        if (!targetChatId) {
            return res.status(400).json({ message: 'Chat ID or Recipient ID required' });
        }

        // C. Create Message
        const newMessage = await AdminMessage.create({
            chat: targetChatId,
            sender: req.user._id,
            senderRole: req.user.role,
            content: content || '',
            ...fileData
        });

        // D. Update Chat Meta (Last Message)
        const updatedChat = await AdminChat.findByIdAndUpdate(targetChatId, {
            lastMessage: newMessage._id,
            lastMessageAt: new Date()
        }, { new: true }).populate('members.user');

        // E. Return Full Message for UI
        const fullMessage = await AdminMessage.findById(newMessage._id)
            .populate('sender', 'name profilePhoto role');

        // Socket IO emission
        if (req.io) {
            const roomId = targetChatId.toString();
            console.log('[Socket] Emitting message to rooms:', {
                chatRoom: roomId,
                adminGlobal: 'admin_global',
                memberRooms: updatedChat.members
                    .filter(m => m.user?._id.toString() !== req.user._id.toString())
                    .map(m => m.user._id.toString())
            });

            // 1. Emit to the Chat Room (Primary)
            req.io.to(roomId).emit('receive_message', fullMessage);

            // 2. Global Broadcast (Fail-safe)
            req.io.to('admin_global').emit('receive_message', fullMessage);

            // 3. Emit to Each Member's Personal Room (Redundancy/Notification)
            updatedChat.members.forEach(member => {
                if (member.user && member.user._id.toString() !== req.user._id.toString()) {
                    req.io.to(member.user._id.toString()).emit('receive_message', fullMessage);
                }
            });
        }

        res.status(201).json(fullMessage);

    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
};

// @desc   Initializes a chat or gets existing (Helper for UI)
// @route  POST /api/admin/chat/init
const initChat = async (req, res) => {
    try {
        const { recipientId } = req.body;
        // Check if private chat already exists
        let chat = await AdminChat.findOne({
            type: 'private',
            "members.user": { $all: [req.user._id, recipientId] }
        })
            .populate('members.user', 'name profilePhoto role isOnline')
            .populate('lastMessage');

        if (!chat) {
            chat = await AdminChat.create({
                type: 'private',
                members: [
                    { user: req.user._id },
                    { user: recipientId }
                ]
            });
            // Re-fetch to populate
            chat = await AdminChat.findById(chat._id)
                .populate('members.user', 'name profilePhoto role isOnline');
        }

        // Format response like getChats does
        const chatObj = chat.toObject();
        const otherMember = chat.members.find(m => m.user._id.toString() !== req.user._id.toString());
        if (otherMember && otherMember.user) {
            chatObj.chatName = otherMember.user.name;
            chatObj.chatAvatar = otherMember.user.profilePhoto;
            chatObj.partnerId = otherMember.user._id;
            chatObj.isOnline = otherMember.user.isOnline || false;
        }

        res.json(chatObj);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
}

// @desc   Clear entire chat history
// @route  POST /api/admin/chat/:id/clear
const clearChat = async (req, res) => {
    try {
        const chatId = req.params.id;
        const { global } = req.body; // true if SuperAdmin wants to wipe for everyone

        // SuperAdmin Global Clear
        if (global && req.user.role === 'super_admin') {
            await AdminMessage.updateMany(
                { chat: chatId },
                { isDeletedGlobally: true }
            );
            return res.json({ message: 'Chat cleared globally' });
        }

        // Local Clear (for self)
        await AdminChat.updateOne(
            { _id: chatId, "members.user": req.user._id },
            {
                $set: { "members.$.clearedAt": new Date() }
            }
        );

        res.json({ message: 'Chat cleared locally' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
};

// @desc   Delete single message
// @route  DELETE /api/admin/chat/message/:id
const deleteMessage = async (req, res) => {
    try {
        const messageId = req.params.id;
        const { global } = req.body; // If true & SA, hard delete

        const message = await AdminMessage.findById(messageId);
        if (!message) return res.status(404).json({ message: 'Message not found' });

        // SuperAdmin Global Delete
        if (global && req.user.role === 'super_admin') {
            message.isDeletedGlobally = true;
            message.content = ""; // Wipe content
            message.fileUrl = null;
            await message.save();
            // Emit update via socket
            if (req.io) {
                req.io.to(message.chat.toString()).emit('message_update', message);
            }
            return res.json(message);
        }

        // Admin Soft Delete (Add to deletedFor)
        if (!message.deletedFor.includes(req.user._id)) {
            message.deletedFor.push(req.user._id);
            await message.save();
        }

        res.json({ message: 'Message deleted' });

    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
};

// @desc   Create a new group chat
// @route  POST /api/admin/chat/group
// @access Private (Admin/SuperAdmin)
const createGroupChat = async (req, res) => {
    try {
        const { groupName, memberIds, description } = req.body;

        if (!groupName || !groupName.trim()) {
            return res.status(400).json({ message: 'Group name is required' });
        }

        if (!memberIds || memberIds.length < 1) {
            return res.status(400).json({ message: 'At least one other member is required' });
        }

        // Create members array including the creator
        const members = [
            { user: req.user._id, isAdmin: true } // Creator is admin
        ];

        memberIds.forEach(id => {
            if (id !== req.user._id.toString()) {
                members.push({ user: id, isAdmin: false });
            }
        });

        // Create the group chat
        const newGroupChat = await AdminChat.create({
            type: 'group',
            groupName: groupName.trim(),
            groupDescription: description || '',
            groupAdmin: req.user._id,
            members
        });

        // Fetch with populated data for response
        const populatedChat = await AdminChat.findById(newGroupChat._id)
            .populate('members.user', 'name profilePhoto role isOnline')
            .populate('groupAdmin', 'name profilePhoto');

        // Format response
        const chatObj = populatedChat.toObject();
        chatObj.chatName = populatedChat.groupName;
        chatObj.chatAvatar = populatedChat.groupAvatar;

        // Notify members via socket
        if (req.io) {
            memberIds.forEach(memberId => {
                req.io.to(memberId.toString()).emit('new_chat_created', chatObj);
            });
        }

        res.status(201).json(chatObj);

    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
};

// @desc   Mark all messages in a chat as read
// @route  PUT /api/admin/chat/:id/read
const markChatRead = async (req, res) => {
    try {
        const chatId = req.params.id;
        const userId = req.user._id;

        // Update all messages in this chat where I haven't read them yet
        const result = await AdminMessage.updateMany(
            {
                chat: chatId,
                "readBy.user": { $ne: userId }
            },
            {
                $push: { readBy: { user: userId, readAt: new Date() } }
            }
        );

        if (result.modifiedCount > 0) {
            // Emit event so sender sees blue ticks
            if (req.io) {
                req.io.to('admin_global').emit('messages_read', { chatId, userId, readAt: new Date() });
            }
        }

        res.json({ message: 'Marked as read', count: result.modifiedCount });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
};

// @desc    Delete a chat (Group admin only for groups, or any member can leave)
// @route   DELETE /api/admin/chat/:id
// @access  Private
const deleteChat = async (req, res) => {
    try {
        const chatId = req.params.id;
        const userId = req.user._id;

        const chat = await AdminChat.findById(chatId);

        if (!chat) {
            return res.status(404).json({ message: 'Chat not found' });
        }

        // Check if user is a member
        const isMember = chat.members.some(m => m.user.toString() === userId.toString());
        if (!isMember) {
            return res.status(403).json({ message: 'Not a member of this chat' });
        }

        if (chat.type === 'group') {
            // Check if user is the group admin
            const isAdmin = chat.groupAdmin?.toString() === userId.toString() ||
                chat.members.some(m => m.user.toString() === userId.toString() && m.isAdmin);

            if (isAdmin) {
                // Delete the entire group chat and its messages
                await AdminMessage.deleteMany({ chat: chatId });
                await AdminChat.findByIdAndDelete(chatId);

                // Notify all members that chat was deleted
                if (req.io) {
                    chat.members.forEach(member => {
                        req.io.to(member.user.toString()).emit('chat_deleted', { chatId });
                    });
                }

                return res.json({ message: 'Group chat deleted successfully' });
            } else {
                // Non-admin can only leave the group
                chat.members = chat.members.filter(m => m.user.toString() !== userId.toString());
                await chat.save();

                if (req.io) {
                    req.io.to(userId.toString()).emit('chat_deleted', { chatId });
                }

                return res.json({ message: 'Left the group successfully' });
            }
        } else {
            // For private chats, just delete for this user (clear history completely)
            // Actually deleting private chats is tricky - just clear history for now
            const memberData = chat.members.find(m => m.user.toString() === userId.toString());
            if (memberData) {
                memberData.clearedAt = new Date();
                await chat.save();
            }

            return res.json({ message: 'Chat cleared' });
        }
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
};

module.exports = {
    getChats,
    getMessages,
    sendMessage,
    initChat,
    createGroupChat,
    clearChat,
    deleteMessage,
    markChatRead,
    deleteChat
};
