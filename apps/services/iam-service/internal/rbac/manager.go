package rbac

import (
	"context"
	"log"
	"sync"
	"time"

	"github.com/4yrg/gradeloop-core-v2/apps/services/iam-service/internal/domain"
)

// RBACManager handles role and permission resolution with caching.
type RBACManager struct {
	repo         domain.RoleRepository
	permRepo     domain.PermissionRepository
	rolePerms    map[string][]string // role_name -> [perm_name, perm_name]
	mu           sync.RWMutex
	cacheRefresh time.Duration
}

func NewRBACManager(repo domain.RoleRepository, permRepo domain.PermissionRepository) *RBACManager {
	m := &RBACManager{
		repo:         repo,
		permRepo:     permRepo,
		rolePerms:    make(map[string][]string),
		cacheRefresh: 5 * time.Minute, // Refresh every 5 minutes
	}
	// Initial load
	go m.refreshCacheLoop()
	return m
}

func (m *RBACManager) refreshCacheLoop() {
	m.RefreshCache() // First load
	ticker := time.NewTicker(m.cacheRefresh)
	for range ticker.C {
		m.RefreshCache()
	}
}

func (m *RBACManager) RefreshCache() {
	ctx := context.Background()
	roles, err := m.repo.FindAll(ctx) // This should fetch roles with permissions preload
	if err != nil {
		log.Printf("RBAC: Failed to refresh cache: %v", err)
		return
	}

	newMap := make(map[string][]string)
	for _, role := range roles {
		perms := []string{}
		for _, p := range role.Permissions {
			perms = append(perms, p.Name)
		}
		newMap[role.Name] = perms
	}

	m.mu.Lock()
	m.rolePerms = newMap
	m.mu.Unlock()
	log.Println("RBAC: Cache refreshed")
}

func (m *RBACManager) HasPermission(ctx context.Context, userID string, requiredPerm string) (bool, error) {
	// 1. Get user roles (This part usually not cached per user to avoid stale user data, or short TTL)
	// We'll fetch from DB for now as per "Load user roles" in middleware requirement.
	roles, err := m.repo.GetRolesByUserID(ctx, userID)
	if err != nil {
		return false, err
	}

	m.mu.RLock()
	defer m.mu.RUnlock()

	for _, role := range roles {
		// Check cached permissions for this role name
		if perms, ok := m.rolePerms[role.Name]; ok {
			for _, p := range perms {
				if p == requiredPerm {
					return true, nil
				}
			}
		}
		// Super Admin Bypass?
		if role.Name == "SUPER_ADMIN" {
			return true, nil
		}
	}

	return false, nil
}

func (m *RBACManager) HasRole(ctx context.Context, userID string, requiredRole string) (bool, error) {
	roles, err := m.repo.GetRolesByUserID(ctx, userID)
	if err != nil {
		return false, err
	}

	for _, role := range roles {
		if role.Name == requiredRole {
			return true, nil
		}
		if role.Name == "SUPER_ADMIN" {
			return true, nil // Super admin has all roles effectively? or separate check. Usually separate.
			// But let's verify exact role usually.
		}
	}
	return false, nil
}
