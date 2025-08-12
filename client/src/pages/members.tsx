import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '../components/ui/avatar';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Trash2, Edit, Plus, Github, Mail, User, Calendar } from 'lucide-react';
import { useToast } from '../hooks/use-toast';

interface Member {
  id: number;
  name: string;
  email: string;
  role: string;
  avatarUrl?: string | null;
  bio?: string | null;
  githubUsername?: string | null;
  skills: string[];
  joinedDate: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface MemberFormData {
  name: string;
  email: string;
  role: string;
  avatarUrl?: string;
  bio?: string;
  githubUsername?: string;
  skills: string[];
  isActive: boolean;
}

const roleOptions = [
  "팀장",
  "프론트엔드 개발자", 
  "백엔드 개발자",
  "풀스택 개발자",
  "디자이너",
  "PM",
  "기획자",
  "QA"
];

const skillOptions = [
  "React", "Vue.js", "Angular", "TypeScript", "JavaScript",
  "Node.js", "Express", "Python", "Java", "C++",
  "PostgreSQL", "MySQL", "MongoDB", "Redis",
  "Docker", "Kubernetes", "AWS", "Azure", "GCP",
  "Figma", "Adobe XD", "Sketch",
  "Git", "Jira", "Slack"
];

interface MembersProps {
  teamName?: string;
}

export default function Members({ teamName }: MembersProps) {
  const [selectedMember, setSelectedMember] = useState<Member | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState<MemberFormData>({
    name: '',
    email: '',
    role: '',
    avatarUrl: '',
    bio: '',
    githubUsername: '',
    skills: [],
    isActive: true
  });
  const [skillInput, setSkillInput] = useState('');

  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Fetch members
  const { data: members = [], isLoading } = useQuery<Member[]>({
    queryKey: ['members', teamName],
    queryFn: async () => {
      const url = teamName 
        ? `/api/members?teamId=${teamName}`
        : '/api/members';
      const response = await fetch(url);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to fetch members');
      }
      return response.json();
    }
  });

  // Create member mutation
  const createMember = useMutation({
    mutationFn: async (data: MemberFormData) => {
      const memberData = teamName ? { ...data, teamId: teamName } : data;
      const response = await fetch('/api/members', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(memberData)
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create member');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['members', teamName] });
      setIsDialogOpen(false);
      resetForm();
      toast({
        title: "멤버 추가 완료",
        description: "새로운 팀원이 성공적으로 추가되었습니다."
      });
    },
    onError: () => {
      toast({
        title: "오류",
        description: "멤버 추가 중 오류가 발생했습니다.",
        variant: "destructive"
      });
    }
  });

  // Update member mutation
  const updateMember = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Partial<MemberFormData> }) => {
      const response = await fetch(`/api/members/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      if (!response.ok) {
        throw new Error('Failed to update member');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['members', teamName] });
      setIsDialogOpen(false);
      setIsEditing(false);
      resetForm();
      toast({
        title: "멤버 수정 완료",
        description: "팀원 정보가 성공적으로 업데이트되었습니다."
      });
    },
    onError: () => {
      toast({
        title: "오류", 
        description: "멤버 정보 수정 중 오류가 발생했습니다.",
        variant: "destructive"
      });
    }
  });

  // Delete member mutation
  const deleteMember = useMutation({
    mutationFn: async (id: number) => {
      const response = await fetch(`/api/members/${id}`, {
        method: 'DELETE'
      });
      if (!response.ok) {
        throw new Error('Failed to delete member');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['members', teamName] });
      toast({
        title: "멤버 삭제 완료",
        description: "팀원이 성공적으로 삭제되었습니다."
      });
    },
    onError: () => {
      toast({
        title: "오류",
        description: "멤버 삭제 중 오류가 발생했습니다.",
        variant: "destructive"
      });
    }
  });

  const resetForm = () => {
    setFormData({
      name: '',
      email: '',
      role: '',
      avatarUrl: '',
      bio: '',
      githubUsername: '',
      skills: [],
      isActive: true
    });
    setSkillInput('');
    setSelectedMember(null);
  };

  const handleEdit = (member: Member) => {
    setSelectedMember(member);
    setFormData({
      name: member.name,
      email: member.email,
      role: member.role,
      avatarUrl: member.avatarUrl || '',
      bio: member.bio || '',
      githubUsername: member.githubUsername || '',
      skills: member.skills,
      isActive: member.isActive
    });
    setIsEditing(true);
    setIsDialogOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isEditing && selectedMember) {
      updateMember.mutate({ id: selectedMember.id, data: formData });
    } else {
      createMember.mutate(formData);
    }
  };

  const addSkill = () => {
    if (skillInput.trim() && !formData.skills.includes(skillInput.trim())) {
      setFormData(prev => ({
        ...prev,
        skills: [...prev.skills, skillInput.trim()]
      }));
      setSkillInput('');
    }
  };

  const removeSkill = (skill: string) => {
    setFormData(prev => ({
      ...prev,
      skills: prev.skills.filter(s => s !== skill)
    }));
  };

  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase();
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('ko-KR');
  };

  if (isLoading) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center h-64">
          <div className="text-lg">멤버 정보를 불러오는 중...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold">
            {teamName ? `${teamName} 팀원 관리` : '팀원 관리'}
          </h1>
          <p className="text-muted-foreground mt-2">
            {teamName ? `${teamName} 팀의 팀원들을 관리합니다` : '바이브코딩 스터디 팀원들의 프로필을 관리합니다'}
          </p>
        </div>
        
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => { resetForm(); setIsEditing(false); }}>
              <Plus className="w-4 h-4 mr-2" />
              새 멤버 추가
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{isEditing ? '멤버 정보 수정' : '새 멤버 추가'}</DialogTitle>
              <DialogDescription>
                팀원의 정보를 입력해주세요. 모든 필드는 선택사항입니다.
              </DialogDescription>
            </DialogHeader>
            
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="name">이름 *</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="email">이메일 *</Label>
                  <Input
                    id="email"
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="role">역할 *</Label>
                  <Select 
                    value={formData.role} 
                    onValueChange={(value) => setFormData(prev => ({ ...prev, role: value }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="역할을 선택하세요" />
                    </SelectTrigger>
                    <SelectContent>
                      {roleOptions.map(role => (
                        <SelectItem key={role} value={role}>{role}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="githubUsername">GitHub 사용자명</Label>
                  <Input
                    id="githubUsername"
                    value={formData.githubUsername}
                    onChange={(e) => setFormData(prev => ({ ...prev, githubUsername: e.target.value }))}
                    placeholder="username"
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="avatarUrl">프로필 이미지 URL</Label>
                <Input
                  id="avatarUrl"
                  value={formData.avatarUrl}
                  onChange={(e) => setFormData(prev => ({ ...prev, avatarUrl: e.target.value }))}
                  placeholder="https://example.com/avatar.jpg"
                />
              </div>

              <div>
                <Label htmlFor="bio">자기소개</Label>
                <Textarea
                  id="bio"
                  value={formData.bio}
                  onChange={(e) => setFormData(prev => ({ ...prev, bio: e.target.value }))}
                  placeholder="간단한 자기소개를 작성해주세요"
                  rows={3}
                />
              </div>

              <div>
                <Label>기술 스택</Label>
                <div className="flex gap-2 mb-2">
                  <Select value={skillInput} onValueChange={setSkillInput}>
                    <SelectTrigger className="flex-1">
                      <SelectValue placeholder="기술을 선택하거나 직접 입력하세요" />
                    </SelectTrigger>
                    <SelectContent>
                      {skillOptions.map(skill => (
                        <SelectItem key={skill} value={skill}>{skill}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    value={skillInput}
                    onChange={(e) => setSkillInput(e.target.value)}
                    placeholder="직접 입력"
                    className="flex-1"
                    onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addSkill())}
                  />
                  <Button type="button" onClick={addSkill} size="sm">
                    추가
                  </Button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {formData.skills.map(skill => (
                    <Badge key={skill} variant="secondary" className="cursor-pointer" onClick={() => removeSkill(skill)}>
                      {skill} ×
                    </Badge>
                  ))}
                </div>
              </div>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                  취소
                </Button>
                <Button type="submit" disabled={createMember.isPending || updateMember.isPending}>
                  {isEditing ? '수정' : '추가'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {members.map((member) => (
          <Card key={member.id} className="hover:shadow-lg transition-shadow">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-3">
                <Avatar className="w-12 h-12">
                  <AvatarImage src={member.avatarUrl || undefined} alt={member.name} />
                  <AvatarFallback>{getInitials(member.name)}</AvatarFallback>
                </Avatar>
                <div className="flex-1">
                  <CardTitle className="text-lg">{member.name}</CardTitle>
                  <CardDescription>{member.role}</CardDescription>
                </div>
                <div className="flex gap-1">
                  <Button variant="ghost" size="sm" onClick={() => handleEdit(member)}>
                    <Edit className="w-4 h-4" />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => deleteMember.mutate(member.id)}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {member.bio && (
                  <p className="text-sm text-muted-foreground line-clamp-2">{member.bio}</p>
                )}
                
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Mail className="w-4 h-4" />
                  <span className="truncate">{member.email}</span>
                </div>

                {member.githubUsername && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Github className="w-4 h-4" />
                    <a 
                      href={`https://github.com/${member.githubUsername}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:underline truncate"
                    >
                      @{member.githubUsername}
                    </a>
                  </div>
                )}

                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Calendar className="w-4 h-4" />
                  <span>가입일: {formatDate(member.joinedDate)}</span>
                </div>

                {member.skills.length > 0 && (
                  <div>
                    <div className="text-sm font-medium mb-2">기술 스택</div>
                    <div className="flex flex-wrap gap-1">
                      {member.skills.slice(0, 6).map(skill => (
                        <Badge key={skill} variant="outline" className="text-xs">
                          {skill}
                        </Badge>
                      ))}
                      {member.skills.length > 6 && (
                        <Badge variant="outline" className="text-xs">
                          +{member.skills.length - 6}
                        </Badge>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {members.length === 0 && (
        <div className="text-center py-12">
          <User className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium mb-2">아직 등록된 멤버가 없습니다</h3>
          <p className="text-muted-foreground mb-4">첫 번째 팀원을 추가해보세요!</p>
          <Button onClick={() => { resetForm(); setIsEditing(false); setIsDialogOpen(true); }}>
            <Plus className="w-4 h-4 mr-2" />
            새 멤버 추가
          </Button>
        </div>
      )}
    </div>
  );
} 