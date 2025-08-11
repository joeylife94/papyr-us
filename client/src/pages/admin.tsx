import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Settings, Plus, Edit, Trash2, Eye, EyeOff, ArrowLeft, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Directory, InsertDirectory, Team, InsertTeam } from "@shared/schema";

const directoryFormSchema = z.object({
  name: z.string().min(1, "Name is required").regex(/^[a-z0-9-_]+$/, "Name must be lowercase letters, numbers, hyphens, or underscores only"),
  displayName: z.string().min(1, "Display name is required"),
  password: z.string().optional(),
  isVisible: z.boolean().default(true),
  order: z.number().min(0).default(0),
});

const teamFormSchema = z.object({
  name: z.string().min(1, "Name is required").regex(/^[a-z0-9-_]+$/, "Name must be lowercase letters, numbers, hyphens, or underscores only"),
  displayName: z.string().min(1, "Display name is required"),
  description: z.string().optional(),
  password: z.string().optional(),
  icon: z.string().optional(),
  color: z.string().optional(),
  isActive: z.boolean().default(true),
  order: z.number().min(0).default(0),
});

type DirectoryFormData = z.infer<typeof directoryFormSchema>;
type TeamFormData = z.infer<typeof teamFormSchema>;

export default function AdminPage() {
  const navigate = useNavigate();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authPassword, setAuthPassword] = useState("");
  const [activeTab, setActiveTab] = useState<"directories" | "teams">("directories");
  const [editingDirectory, setEditingDirectory] = useState<Directory | null>(null);
  const [editingTeam, setEditingTeam] = useState<Team | null>(null);
  const [isDirectoryDialogOpen, setIsDirectoryDialogOpen] = useState(false);
  const [isTeamDialogOpen, setIsTeamDialogOpen] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const directoryForm = useForm<DirectoryFormData>({
    resolver: zodResolver(directoryFormSchema),
    defaultValues: {
      name: "",
      displayName: "",
      password: "",
      isVisible: true,
      order: 0,
    },
  });

  const teamForm = useForm<TeamFormData>({
    resolver: zodResolver(teamFormSchema),
    defaultValues: {
      name: "",
      displayName: "",
      description: "",
      password: "",
      icon: "",
      color: "",
      isActive: true,
      order: 0,
    },
  });

  // Check authentication on page load
  useEffect(() => {
    const stored = sessionStorage.getItem("adminAuth");
    if (stored) {
      // Verify stored password with server
      fetch("/papyr-us/api/admin/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: stored }),
      }).then(response => {
        if (response.ok) {
          setIsAuthenticated(true);
        } else {
          sessionStorage.removeItem("adminAuth");
        }
      });
    }
  }, []);

  const handleAuth = async () => {
    try {
      const response = await fetch("/papyr-us/api/admin/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: authPassword }),
      });

      if (response.ok) {
        setIsAuthenticated(true);
        sessionStorage.setItem("adminAuth", authPassword);
        toast({
          title: "Authentication successful",
          description: "Welcome to the admin panel",
        });
      } else {
        toast({
          title: "Authentication failed",
          description: "Invalid password",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to authenticate",
        variant: "destructive",
      });
    }
  };

  const { data: directories = [], refetch: refetchDirectories } = useQuery<Directory[]>({
    queryKey: ["/papyr-us/api/admin/directories"],
    queryFn: async () => {
      const storedPassword = sessionStorage.getItem("adminAuth") || "";
      const response = await fetch(`/papyr-us/api/admin/directories?adminPassword=${storedPassword}`);
      if (!response.ok) throw new Error("Failed to fetch directories");
      return response.json();
    },
    enabled: isAuthenticated,
  });

  const { data: teams = [], refetch: refetchTeams } = useQuery<Team[]>({
    queryKey: ["/papyr-us/api/teams"],
    queryFn: async () => {
      const response = await fetch("/papyr-us/api/teams");
      if (!response.ok) throw new Error("Failed to fetch teams");
      return response.json();
    },
    enabled: isAuthenticated,
  });

  const createDirectoryMutation = useMutation({
    mutationFn: async (data: InsertDirectory) => {
      const storedPassword = sessionStorage.getItem("adminAuth") || "";
              const response = await fetch("/papyr-us/api/admin/directories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...data, adminPassword: storedPassword }),
      });
      if (!response.ok) throw new Error("Failed to create directory");
      return response.json();
    },
    onSuccess: () => {
      refetchDirectories();
      setIsDirectoryDialogOpen(false);
      directoryForm.reset();
      toast({
        title: "Directory created",
        description: "New directory has been added successfully",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to create directory",
        variant: "destructive",
      });
    },
  });

  const updateDirectoryMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Partial<Directory> }) => {
      const storedPassword = sessionStorage.getItem("adminAuth") || "";
      const response = await fetch(`/papyr-us/api/admin/directories/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...data, adminPassword: storedPassword }),
      });
      if (!response.ok) throw new Error("Failed to update directory");
      return response.json();
    },
    onSuccess: () => {
      refetchDirectories();
      setEditingDirectory(null);
      setIsDirectoryDialogOpen(false);
      directoryForm.reset();
      toast({
        title: "Directory updated",
        description: "Directory has been updated successfully",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update directory",
        variant: "destructive",
      });
    },
  });

  const deleteDirectoryMutation = useMutation({
    mutationFn: async (id: number) => {
      const storedPassword = sessionStorage.getItem("adminAuth") || "";
      const response = await fetch(`/papyr-us/api/admin/directories/${id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adminPassword: storedPassword }),
      });
      if (!response.ok) throw new Error("Failed to delete directory");
    },
    onSuccess: () => {
      refetchDirectories();
      toast({
        title: "Directory deleted",
        description: "Directory has been removed successfully",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to delete directory",
        variant: "destructive",
      });
    },
  });

  // Team mutations
  const createTeamMutation = useMutation({
    mutationFn: async (data: InsertTeam) => {
      const response = await fetch("/papyr-us/api/teams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!response.ok) throw new Error("Failed to create team");
      return response.json();
    },
    onSuccess: () => {
      refetchTeams();
      setIsTeamDialogOpen(false);
      teamForm.reset();
      toast({
        title: "Team created",
        description: "New team has been added successfully",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to create team",
        variant: "destructive",
      });
    },
  });

  const updateTeamMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Partial<Team> }) => {
      const response = await fetch(`/papyr-us/api/teams/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!response.ok) throw new Error("Failed to update team");
      return response.json();
    },
    onSuccess: () => {
      refetchTeams();
      setEditingTeam(null);
      setIsTeamDialogOpen(false);
      teamForm.reset();
      toast({
        title: "Team updated",
        description: "Team has been updated successfully",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update team",
        variant: "destructive",
      });
    },
  });

  const deleteTeamMutation = useMutation({
    mutationFn: async (id: number) => {
      const response = await fetch(`/papyr-us/api/teams/${id}`, {
        method: "DELETE",
      });
      if (!response.ok) throw new Error("Failed to delete team");
    },
    onSuccess: () => {
      refetchTeams();
      toast({
        title: "Team deleted",
        description: "Team has been removed successfully",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to delete team",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: DirectoryFormData | TeamFormData) => {
    if (activeTab === "directories") {
      const directoryData = data as DirectoryFormData;
      if (editingDirectory) {
        updateDirectoryMutation.mutate({
          id: editingDirectory.id,
          data: {
            ...directoryData,
            password: directoryData.password || null,
          },
        });
      } else {
        createDirectoryMutation.mutate({
          ...directoryData,
          password: directoryData.password || undefined,
        });
      }
    } else if (activeTab === "teams") {
      const teamData = data as TeamFormData;
      if (editingTeam) {
        updateTeamMutation.mutate({
          id: editingTeam.id,
          data: {
            ...teamData,
            password: teamData.password || null,
            description: teamData.description || null,
            icon: teamData.icon || null,
            color: teamData.color || null,
          },
        });
      } else {
        createTeamMutation.mutate({
          ...teamData,
          password: teamData.password || null,
          description: teamData.description || null,
          icon: teamData.icon || null,
          color: teamData.color || null,
        });
      }
    }
  };

  const handleEdit = (directory: Directory) => {
    setEditingDirectory(directory);
    directoryForm.reset({
      name: directory.name,
      displayName: directory.displayName,
      password: directory.password || "",
      isVisible: directory.isVisible,
      order: directory.order,
    });
    setIsDirectoryDialogOpen(true);
  };

  const handleDelete = (id: number) => {
    if (confirm("Are you sure you want to delete this directory?")) {
      deleteDirectoryMutation.mutate(id);
    }
  };

  const handleEditTeam = (team: Team) => {
    setEditingTeam(team);
    teamForm.reset({
      name: team.name,
      displayName: team.displayName,
      description: team.description || "",
      password: team.password || "",
      icon: team.icon || "",
      color: team.color || "",
      isActive: team.isActive,
      order: team.order,
    });
    setIsTeamDialogOpen(true);
  };

  const handleDeleteTeam = (id: number) => {
    if (confirm("Are you sure you want to delete this team?")) {
      deleteTeamMutation.mutate(id);
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 flex items-center justify-center p-6">
        <Card className="w-full max-w-md shadow-lg">
          <CardHeader className="text-center">
            <div className="mx-auto w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mb-4">
              <Lock className="w-6 h-6 text-primary" />
            </div>
            <CardTitle className="text-2xl">Admin Access</CardTitle>
            <p className="text-slate-600 dark:text-slate-400">
              Enter the admin password to continue
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <Input
              type="password"
              placeholder="Admin password"
              value={authPassword}
              onChange={(e) => setAuthPassword(e.target.value)}
              onKeyPress={(e) => e.key === "Enter" && handleAuth()}
            />
            <Button onClick={handleAuth} className="w-full">
              Login
            </Button>
            <Button
              variant="outline"
              onClick={() => navigate("/papyr-us/")}
              className="w-full"
            >
              Back to Home
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center space-x-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate("/papyr-us/")}
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Wiki
          </Button>
          <div>
            <h1 className="text-3xl font-bold text-slate-900 dark:text-white flex items-center">
              <Settings className="h-8 w-8 mr-3 text-primary" />
              Admin Panel
            </h1>
            <p className="text-slate-600 dark:text-slate-400">
              Manage directories, teams, and access permissions
            </p>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as "directories" | "teams")} className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="directories">Directories</TabsTrigger>
            <TabsTrigger value="teams">Teams</TabsTrigger>
          </TabsList>
          
          <TabsContent value="directories" className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold text-slate-900 dark:text-white">
                  Directory Management
                </h2>
                <p className="text-slate-600 dark:text-slate-400">
                  Manage directories and access permissions
                </p>
              </div>
              
              <Dialog open={isDirectoryDialogOpen} onOpenChange={setIsDirectoryDialogOpen}>
            <DialogTrigger asChild>
              <Button
                                  onClick={() => {
                    setEditingDirectory(null);
                    directoryForm.reset();
                  }}
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Directory
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
              <DialogHeader>
                <DialogTitle>
                  {editingDirectory ? "Edit Directory" : "Create Directory"}
                </DialogTitle>
              </DialogHeader>
              <Form {...directoryForm}>
                <form onSubmit={directoryForm.handleSubmit(onSubmit)} className="space-y-4">
                  <FormField
                    control={directoryForm.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Directory Name</FormLabel>
                        <FormControl>
                          <Input placeholder="docs, team1, etc." {...field} />
                        </FormControl>
                        <p className="text-xs text-slate-500">
                          Lowercase letters, numbers, hyphens, and underscores only
                        </p>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={directoryForm.control}
                    name="displayName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Display Name</FormLabel>
                        <FormControl>
                          <Input placeholder="Documentation, Team Alpha, etc." {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={directoryForm.control}
                    name="password"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Password (Optional)</FormLabel>
                        <FormControl>
                          <Input type="password" placeholder="Leave empty for no password" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={directoryForm.control}
                    name="order"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Sort Order</FormLabel>
                        <FormControl>
                          <Input 
                            type="number" 
                            {...field} 
                            onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={directoryForm.control}
                    name="isVisible"
                    render={({ field }) => (
                      <FormItem className="flex items-center justify-between">
                        <FormLabel>Visible in Sidebar</FormLabel>
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="flex justify-end space-x-2">
                    <Button 
                      type="button" 
                      variant="outline" 
                      onClick={() => setIsDirectoryDialogOpen(false)}
                    >
                      Cancel
                    </Button>
                    <Button type="submit">
                      {editingDirectory ? "Update" : "Create"}
                    </Button>
                  </div>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        </div>

        {/* Directories Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {directories.map((directory) => (
            <Card key={directory.id} className="hover:shadow-lg transition-shadow">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg flex items-center">
                    {directory.isVisible ? (
                      <Eye className="h-4 w-4 mr-2 text-green-500" />
                    ) : (
                      <EyeOff className="h-4 w-4 mr-2 text-slate-400" />
                    )}
                    {directory.displayName}
                  </CardTitle>
                  <div className="flex space-x-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleEdit(directory)}
                    >
                      <Edit className="h-3 w-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(directory.id)}
                      className="text-red-500 hover:text-red-700"
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-500">Name:</span>
                  <Badge variant="outline">{directory.name}</Badge>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-500">Order:</span>
                  <span className="font-mono">{directory.order}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-500">Protected:</span>
                  <Badge variant={directory.password ? "destructive" : "secondary"}>
                    {directory.password ? "Yes" : "No"}
                  </Badge>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-500">Status:</span>
                  <Badge variant={directory.isVisible ? "default" : "secondary"}>
                    {directory.isVisible ? "Visible" : "Hidden"}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {directories.length === 0 && (
          <Card className="text-center py-12">
            <CardContent>
              <Settings className="h-12 w-12 text-slate-400 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">
                No directories found
              </h3>
              <p className="text-slate-600 dark:text-slate-400 mb-4">
                Create your first directory to get started
              </p>
              <Button onClick={() => setIsDirectoryDialogOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Add Directory
              </Button>
            </CardContent>
          </Card>
        )}
          </TabsContent>

          <TabsContent value="teams" className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold text-slate-900 dark:text-white">
                  Team Management
                </h2>
                <p className="text-slate-600 dark:text-slate-400">
                  Manage teams and their members
                </p>
              </div>
              
              <Dialog open={isTeamDialogOpen} onOpenChange={setIsTeamDialogOpen}>
                <DialogTrigger asChild>
                  <Button
                    onClick={() => {
                      setEditingTeam(null);
                      teamForm.reset();
                    }}
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Add Team
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-[425px]">
                  <DialogHeader>
                    <DialogTitle>
                      {editingTeam ? "Edit Team" : "Create Team"}
                    </DialogTitle>
                  </DialogHeader>
                  <Form {...teamForm}>
                    <form onSubmit={teamForm.handleSubmit(onSubmit)} className="space-y-4">
                                              <FormField
                          control={teamForm.control}
                          name="name"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Team Name</FormLabel>
                            <FormControl>
                              <Input placeholder="backend-team, frontend-team, etc." {...field} />
                            </FormControl>
                            <p className="text-xs text-slate-500">
                              Lowercase letters, numbers, hyphens, and underscores only
                            </p>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      
                                              <FormField
                          control={teamForm.control}
                          name="displayName"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Display Name</FormLabel>
                            <FormControl>
                              <Input placeholder="Backend Team, Frontend Team, etc." {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      
                                              <FormField
                          control={teamForm.control}
                          name="description"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Description</FormLabel>
                            <FormControl>
                              <Input placeholder="Team description..." {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      
                                              <FormField
                          control={teamForm.control}
                          name="password"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Access Password</FormLabel>
                            <FormControl>
                              <Input type="password" placeholder="Leave empty for no password" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      
                                              <FormField
                          control={teamForm.control}
                          name="icon"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Icon (Lucide)</FormLabel>
                            <FormControl>
                              <Input placeholder="Server, Monitor, Cloud, etc." {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      
                                              <FormField
                          control={teamForm.control}
                          name="color"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Color Class</FormLabel>
                            <FormControl>
                              <Input placeholder="text-blue-500, text-green-500, etc." {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      
                                              <FormField
                          control={teamForm.control}
                          name="order"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Sort Order</FormLabel>
                            <FormControl>
                              <Input 
                                type="number" 
                                {...field} 
                                onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      
                                              <FormField
                          control={teamForm.control}
                          name="isActive"
                        render={({ field }) => (
                          <FormItem className="flex items-center justify-between">
                            <FormLabel>Active</FormLabel>
                            <FormControl>
                              <Switch
                                checked={field.value}
                                onCheckedChange={field.onChange}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <div className="flex justify-end space-x-2">
                        <Button 
                          type="button" 
                          variant="outline" 
                          onClick={() => setIsTeamDialogOpen(false)}
                        >
                          Cancel
                        </Button>
                        <Button type="submit">
                          {editingTeam ? "Update" : "Create"}
                        </Button>
                      </div>
                    </form>
                  </Form>
                </DialogContent>
              </Dialog>
            </div>

            {/* Teams Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {teams.map((team) => (
                <Card key={team.id} className="hover:shadow-lg transition-shadow">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-lg flex items-center">
                        {team.isActive ? (
                          <Eye className="h-4 w-4 mr-2 text-green-500" />
                        ) : (
                          <EyeOff className="h-4 w-4 mr-2 text-slate-400" />
                        )}
                        {team.displayName}
                      </CardTitle>
                      <div className="flex space-x-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEditTeam(team)}
                        >
                          <Edit className="h-3 w-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteTeam(team.id)}
                          className="text-red-500 hover:text-red-700"
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-slate-500">Name:</span>
                      <Badge variant="outline">{team.name}</Badge>
                    </div>
                    {team.description && (
                      <div className="text-sm text-slate-600 dark:text-slate-400">
                        {team.description}
                      </div>
                    )}
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-slate-500">Order:</span>
                      <span className="font-mono">{team.order}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-slate-500">Protected:</span>
                      <Badge variant={team.password ? "destructive" : "secondary"}>
                        {team.password ? "Yes" : "No"}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-slate-500">Status:</span>
                      <Badge variant={team.isActive ? "default" : "secondary"}>
                        {team.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {teams.length === 0 && (
              <Card className="text-center py-12">
                <CardContent>
                  <Settings className="h-12 w-12 text-slate-400 mx-auto mb-4" />
                  <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">
                    No teams found
                  </h3>
                  <p className="text-slate-600 dark:text-slate-400 mb-4">
                    Create your first team to get started
                  </p>
                  <Button onClick={() => setIsTeamDialogOpen(true)}>
                    <Plus className="h-4 w-4 mr-2" />
                    Add Team
                  </Button>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}