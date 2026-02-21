"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { useToast } from "@/hooks/use-toast";
import { createUser } from "@/lib/api/iam";
import { CreateUserRequest, Role } from "@/lib/types/iam";
import { Loader2, Copy, CheckCircle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

interface CreateUserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUserCreated: () => void;
  roles: Role[];
}

export function CreateUserDialog({
  open,
  onOpenChange,
  onUserCreated,
  roles,
}: CreateUserDialogProps) {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [activationLink, setActivationLink] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);

  const [formData, setFormData] = useState<{
    username: string;
    email: string;
    role_id: string;
    student_id: string;
    designation: string;
  }>({
    username: "",
    email: "",
    role_id: "",
    student_id: "",
    designation: "",
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  // Get the selected role's user_type
  const selectedRole = roles.find((role) => role.id === formData.role_id);
  const userType = selectedRole?.user_type || "all";

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.username.trim()) {
      newErrors.username = "Username is required";
    } else if (formData.username.length < 3) {
      newErrors.username = "Username must be at least 3 characters";
    }

    if (!formData.email.trim()) {
      newErrors.email = "Email is required";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = "Invalid email format";
    }

    if (!formData.role_id) {
      newErrors.role_id = "Role is required";
    }

    // Validate based on role's user_type
    if (userType === "student" && !formData.student_id?.trim()) {
      newErrors.student_id = "Student ID is required for student roles";
    }

    if (userType === "employee" && !formData.designation?.trim()) {
      newErrors.designation = "Designation is required for employee roles";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    setIsLoading(true);

    try {
      // Determine user_type from role
      let derivedUserType: "student" | "employee";
      if (userType === "student") {
        derivedUserType = "student";
      } else if (userType === "employee") {
        derivedUserType = "employee";
      } else {
        // For "all" type roles, default to employee
        derivedUserType = "employee";
      }

      // Prepare request data
      const requestData: CreateUserRequest = {
        username: formData.username.trim(),
        email: formData.email.trim(),
        role_id: formData.role_id,
        user_type: derivedUserType,
      };

      if (derivedUserType === "student" && formData.student_id) {
        requestData.student_id = formData.student_id.trim();
      }

      if (derivedUserType === "employee" && formData.designation) {
        requestData.designation = formData.designation.trim();
      }

      const response = await createUser(requestData);

      setActivationLink(response.activation_link);

      toast({
        title: "User created successfully",
        description: `${response.username} has been created. Share the activation link with the user.`,
      });

      onUserCreated();

      // Don't close dialog yet - show activation link
    } catch (error) {
      toast({
        title: "Failed to create user",
        description:
          (error as Error).message ||
          "An error occurred while creating the user",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopyLink = async () => {
    if (activationLink) {
      await navigator.clipboard.writeText(activationLink);
      setCopiedLink(true);
      toast({
        title: "Link copied",
        description: "Activation link copied to clipboard",
      });
      setTimeout(() => setCopiedLink(false), 2000);
    }
  };

  const handleClose = () => {
    setFormData({
      username: "",
      email: "",
      role_id: "",
      student_id: "",
      designation: "",
    });
    setErrors({});
    setActivationLink(null);
    setCopiedLink(false);
    onOpenChange(false);
  };

  // Available roles
  const availableRoles = roles;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Create New User</DialogTitle>
          <DialogDescription>
            {activationLink
              ? "User created successfully. Share the activation link below."
              : "Add a new user to the system. An activation link will be generated."}
          </DialogDescription>
        </DialogHeader>

        {activationLink ? (
          <div className="space-y-4">
            <Alert>
              <CheckCircle className="h-4 w-4" />
              <AlertTitle>User Created Successfully</AlertTitle>
              <AlertDescription>
                Share this activation link with the user. They will use it to
                set their password and activate their account.
              </AlertDescription>
            </Alert>

            <div className="space-y-2">
              <Label>Activation Link</Label>
              <div className="flex items-center gap-2">
                <Input
                  value={activationLink}
                  readOnly
                  className="font-mono text-sm"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={handleCopyLink}
                >
                  {copiedLink ? (
                    <CheckCircle className="h-4 w-4 text-green-600" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>

            <DialogFooter>
              <Button onClick={handleClose}>Done</Button>
            </DialogFooter>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="space-y-4 py-4">
              {/* Username */}
              <div className="space-y-2">
                <Label htmlFor="username">
                  Username <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="username"
                  placeholder="Enter username"
                  value={formData.username}
                  onChange={(e) =>
                    setFormData({ ...formData, username: e.target.value })
                  }
                  className={errors.username ? "border-red-500" : ""}
                />
                {errors.username && (
                  <p className="text-sm text-red-500">{errors.username}</p>
                )}
              </div>

              {/* Email */}
              <div className="space-y-2">
                <Label htmlFor="email">
                  Email <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="user@example.com"
                  value={formData.email}
                  onChange={(e) =>
                    setFormData({ ...formData, email: e.target.value })
                  }
                  className={errors.email ? "border-red-500" : ""}
                />
                {errors.email && (
                  <p className="text-sm text-red-500">{errors.email}</p>
                )}
              </div>

              {/* Role */}
              <div className="space-y-2">
                <Label htmlFor="role">
                  Role <span className="text-red-500">*</span>
                </Label>
                <Select
                  value={formData.role_id}
                  onValueChange={(value) =>
                    setFormData({
                      ...formData,
                      role_id: value,
                      // Clear conditional fields when role changes
                      student_id: "",
                      designation: "",
                    })
                  }
                >
                  <SelectTrigger
                    className={errors.role_id ? "border-red-500" : ""}
                  >
                    <SelectValue placeholder="Select a role" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableRoles.map((role) => (
                      <SelectItem key={role.id} value={role.id}>
                        {role.name}
                        {role.user_type && (
                          <span className="text-muted-foreground text-xs ml-2">
                            (
                            {role.user_type === "all"
                              ? "All Users"
                              : role.user_type === "student"
                                ? "Student"
                                : "Employee"}
                            )
                          </span>
                        )}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.role_id && (
                  <p className="text-sm text-red-500">{errors.role_id}</p>
                )}
                {selectedRole && selectedRole.user_type && (
                  <p className="text-sm text-muted-foreground">
                    This role is for{" "}
                    <span className="font-medium">
                      {selectedRole.user_type === "all"
                        ? "all user types"
                        : selectedRole.user_type === "student"
                          ? "students"
                          : "employees"}
                    </span>
                  </p>
                )}
              </div>

              {/* Student ID - Conditional based on role's user_type */}
              {(userType === "student" || userType === "all") && (
                <div className="space-y-2">
                  <Label htmlFor="student_id">
                    Student ID <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="student_id"
                    placeholder="Enter student ID"
                    value={formData.student_id}
                    onChange={(e) =>
                      setFormData({ ...formData, student_id: e.target.value })
                    }
                    className={errors.student_id ? "border-red-500" : ""}
                  />
                  {errors.student_id && (
                    <p className="text-sm text-red-500">{errors.student_id}</p>
                  )}
                </div>
              )}

              {/* Designation - Conditional based on role's user_type */}
              {(userType === "employee" || userType === "all") && (
                <div className="space-y-2">
                  <Label htmlFor="designation">
                    Designation <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="designation"
                    placeholder="e.g., Lecturer, Professor"
                    value={formData.designation}
                    onChange={(e) =>
                      setFormData({ ...formData, designation: e.target.value })
                    }
                    className={errors.designation ? "border-red-500" : ""}
                  />
                  {errors.designation && (
                    <p className="text-sm text-red-500">{errors.designation}</p>
                  )}
                </div>
              )}
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={handleClose}
                disabled={isLoading}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isLoading}>
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Create User
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
