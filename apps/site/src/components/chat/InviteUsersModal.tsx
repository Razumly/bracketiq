'use client';

import { type RefObject, useEffect, useInsertionEffect, useRef, useState } from 'react';
import { userService } from '@/lib/userService';
import { useChat } from '@/context/ChatContext';
import { useChatUI } from '@/context/ChatUIContext';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { MOBILE_APP_THEME_TOKENS } from '@/app/theme/mobilePalette';


interface User {
    $id: string;
    firstName: string;
    lastName: string;
    userName: string;
    profileImageId?: string;
}
function getUserAvatar(user: User) {
    if (user.profileImageId) return user.profileImageId;

    const initials = `${user.firstName?.[0] || ''}${user.lastName?.[0] || ''}`.toUpperCase();
    return `data:image/svg+xml,${encodeURIComponent(
        `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40">
    <rect width="40" height="40" fill="${MOBILE_APP_THEME_TOKENS.primary}"/>
    <text x="20" y="26" font-family="Arial" font-size="16" fill="white" text-anchor="middle">${initials}</text>
  </svg>`
    )}`;
}

function InviteSearchField({
    searchInputRef,
    searchQuery,
    onSearchChange,
}: {
    searchInputRef: RefObject<HTMLInputElement | null>;
    searchQuery: string;
    onSearchChange: (value: string) => void;
}) {
    return (
        <div className="border-b border-border pb-4">
            <Field>
                <FieldLabel htmlFor="invite-user-search" className="sr-only">
                    Search users
                </FieldLabel>
                <Input
                    id="invite-user-search"
                    ref={searchInputRef}
                    value={searchQuery}
                    onChange={(event) => onSearchChange(event.currentTarget.value)}
                    placeholder="Search by name or username..."
                />
                {searchQuery.length > 0 && searchQuery.length < 2 && (
                    <FieldDescription>
                        Type at least 2 characters to search for users
                    </FieldDescription>
                )}
            </Field>
        </div>
    );
}

function SelectedUsersSection({
    selectedUsers,
    onRemoveUser,
}: {
    selectedUsers: User[];
    onRemoveUser: (userId: string) => void;
}) {
    if (selectedUsers.length === 0) {
        return null;
    }

    return (
        <div className="border-b border-border py-4">
            <h3 className="mb-2 text-sm font-semibold text-foreground">
                Selected Users ({selectedUsers.length})
            </h3>
            <div className="max-h-30 space-y-2 overflow-y-auto">
                {selectedUsers.map((user) => {
                    const fullName = `${user.firstName} ${user.lastName}`.trim();
                    const initials = `${user.firstName?.[0] || ''}${user.lastName?.[0] || ''}`.toUpperCase();
                    return (
                        <Card
                            key={user.$id}
                            size="sm"
                            className="flex items-center justify-between gap-3 border-primary/20 bg-primary/5"
                        >
                            <div className="flex min-w-0 items-center gap-3">
                                <Avatar size="sm">
                                    <AvatarImage src={getUserAvatar(user)} alt={fullName} />
                                    <AvatarFallback>{initials}</AvatarFallback>
                                </Avatar>
                                <div className="min-w-0">
                                    <p className="truncate text-sm font-medium text-foreground">
                                        {fullName}
                                    </p>
                                    <p className="truncate text-xs text-muted-foreground">
                                        @{user.userName}
                                    </p>
                                </div>
                            </div>
                            <Button
                                type="button"
                                variant="ghost"
                                size="xs"
                                onClick={() => onRemoveUser(user.$id)}
                                aria-label={`Remove ${fullName}`}
                            >
                                Remove
                            </Button>
                        </Card>
                    );
                })}
            </div>
        </div>
    );
}

function SearchResultsSection({
    searchQuery,
    searchResults,
    searching,
    onAddUser,
}: {
    searchQuery: string;
    searchResults: User[];
    searching: boolean;
    onAddUser: (user: User) => void;
}) {
    return (
        <div className="min-h-0 flex-1 py-4">
            {searching && (
                <div className="flex items-center justify-center gap-2 py-2" role="status">
                    <div
                        className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent motion-reduce:animate-none"
                        aria-hidden="true"
                    />
                    <span className="text-sm text-muted-foreground">Searching...</span>
                </div>
            )}

            {searchResults.length > 0 && (
                <div className="max-h-80 space-y-2 overflow-y-auto">
                    {searchResults.map((user) => {
                        const fullName = `${user.firstName} ${user.lastName}`.trim();
                        const initials = `${user.firstName?.[0] || ''}${user.lastName?.[0] || ''}`.toUpperCase();
                        return (
                            <Button
                                key={user.$id}
                                type="button"
                                variant="outline"
                                className="h-auto w-full justify-start gap-3 p-3 text-left"
                                onClick={() => onAddUser(user)}
                                aria-label={`Add ${fullName} to chat`}
                            >
                                <Avatar>
                                    <AvatarImage src={getUserAvatar(user)} alt={fullName} />
                                    <AvatarFallback>{initials}</AvatarFallback>
                                </Avatar>
                                <span className="min-w-0 flex-1">
                                    <span className="block truncate text-sm font-medium">
                                        {fullName}
                                    </span>
                                    <span className="block truncate text-sm text-muted-foreground">
                                        @{user.userName}
                                    </span>
                                </span>
                                <span className="text-lg font-bold text-primary" aria-hidden="true">
                                    +
                                </span>
                            </Button>
                        );
                    })}
                </div>
            )}

            {searchQuery.length >= 2 && !searching && searchResults.length === 0 && (
                <Card size="sm" className="text-center text-sm text-muted-foreground">
                    {`No users found matching "${searchQuery}"`}
                </Card>
            )}
        </div>
    );
}

function InviteDialogBody({
    searchInputRef,
    searchQuery,
    searchResults,
    selectedUsers,
    searching,
    loading,
    onAddUser,
    onClose,
    onRemoveUser,
    onSearchChange,
    onSubmit,
}: {
    searchInputRef: RefObject<HTMLInputElement | null>;
    searchQuery: string;
    searchResults: User[];
    selectedUsers: User[];
    searching: boolean;
    loading: boolean;
    onAddUser: (user: User) => void;
    onClose: () => void;
    onRemoveUser: (userId: string) => void;
    onSearchChange: (value: string) => void;
    onSubmit: () => void | Promise<void>;
}) {
    return (
        <>
            <DialogHeader>
                <DialogTitle>Create New Chat</DialogTitle>
                <DialogDescription>
                    Search and select users to start a conversation
                </DialogDescription>
            </DialogHeader>

            <div className="flex min-h-0 flex-col">
                <InviteSearchField
                    searchInputRef={searchInputRef}
                    searchQuery={searchQuery}
                    onSearchChange={onSearchChange}
                />
                <SelectedUsersSection
                    selectedUsers={selectedUsers}
                    onRemoveUser={onRemoveUser}
                />
                <SearchResultsSection
                    searchQuery={searchQuery}
                    searchResults={searchResults}
                    searching={searching}
                    onAddUser={onAddUser}
                />

                <DialogFooter className="border-t-0 bg-transparent p-0">
                    <Button type="button" variant="outline" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button
                        type="button"
                        onClick={() => { void onSubmit(); }}
                        disabled={selectedUsers.length === 0 || loading}
                    >
                        {loading ? 'Creating...' : `Create Chat ${selectedUsers.length > 0 ? `(${selectedUsers.length})` : ''}`}
                    </Button>
                </DialogFooter>
            </div>
        </>
    );
}


export function InviteUsersModal() {
    const { isInviteModalOpen, setInviteModalOpen } = useChatUI();
    const { createChatGroup } = useChat();

    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<User[]>([]);
    const [selectedUsers, setSelectedUsers] = useState<User[]>([]);
    const [loading, setLoading] = useState(false);
    const [searching, setSearching] = useState(false);
    const searchInputRef = useRef<HTMLInputElement>(null);
    const openerRef = useRef<HTMLElement | null>(null);
    const wasOpenRef = useRef(false);

    useInsertionEffect(() => {
        if (!isInviteModalOpen || wasOpenRef.current || typeof document === 'undefined') {
            return;
        }

        const activeElement = document.activeElement;
        openerRef.current = activeElement instanceof HTMLElement && activeElement !== document.body
            ? activeElement
            : null;
    }, [isInviteModalOpen]);

    useEffect(() => {
        if (!isInviteModalOpen && wasOpenRef.current) {
            setSelectedUsers([]);
            setSearchQuery('');
            setSearchResults([]);

            const opener = openerRef.current;
            const restoreFocus = () => {
                if (opener?.isConnected) {
                    opener.focus();
                }
            };

            if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
                window.requestAnimationFrame(restoreFocus);
            } else {
                restoreFocus();
            }
        }

        wasOpenRef.current = isInviteModalOpen;
    }, [isInviteModalOpen]);


    // Search users with debounce
    useEffect(() => {
        if (searchQuery.length < 2) {
            setSearchResults([]);
            return;
        }

        const searchUsers = async () => {
            setSearching(true);
            try {
                const results = await userService.searchUsers(searchQuery);
                const filteredResults = results.filter(user =>
                    !selectedUsers.some(selected => selected.$id === user.$id)
                );
                setSearchResults(filteredResults);
            } catch (error) {
                console.error('Failed to search users:', error);
                setSearchResults([]);
            } finally {
                setSearching(false);
            }
        };

        const timeoutId = setTimeout(searchUsers, 300);
        return () => clearTimeout(timeoutId);
    }, [searchQuery, selectedUsers]);

    const handleAddUser = (user: User) => {
        setSelectedUsers(prev => [...prev, user]);
        setSearchResults(prev => prev.filter(u => u.$id !== user.$id));
    };

    const handleRemoveUser = (userId: string) => {
        setSelectedUsers(prev => prev.filter(u => u.$id !== userId));
    };

    const handleClose = () => {
        setInviteModalOpen(false);
        setSelectedUsers([]);
        setSearchQuery('');
        setSearchResults([]);
    };

    const handleSubmit = async () => {
        if (selectedUsers.length === 0) return;

        setLoading(true);
        try {
            const defaultName = selectedUsers.length === 1
                ? `Chat with ${selectedUsers[0].firstName} ${selectedUsers[0].lastName}`
                : `Group Chat`;

            const userIds = selectedUsers.map(u => u.$id);
            await createChatGroup(defaultName, userIds);
            handleClose();
        } catch (error) {
            console.error('Failed to create chat:', error);
        } finally {
            setLoading(false);
        }
    };


    return (
        <Dialog
            open={isInviteModalOpen}
            onOpenChange={(open) => {
                if (!open) {
                    handleClose();
                }
            }}
        >
            <DialogContent
                className="max-w-lg"
                initialFocus={searchInputRef}
                finalFocus={false}
            >
                <InviteDialogBody
                    searchInputRef={searchInputRef}
                    searchQuery={searchQuery}
                    searchResults={searchResults}
                    selectedUsers={selectedUsers}
                    searching={searching}
                    loading={loading}
                    onAddUser={handleAddUser}
                    onClose={handleClose}
                    onRemoveUser={handleRemoveUser}
                    onSearchChange={setSearchQuery}
                    onSubmit={handleSubmit}
                />
            </DialogContent>
        </Dialog>
    );
}
