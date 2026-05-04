from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.orm import Session

from .deps import get_db, get_current_user
from ...models.user import User
from ...schemas.auth import LoginRequest, LoginResponse, UserResponse
from ...services.auth import authenticate_user
from ...utils.security import create_access_token, set_auth_cookie, clear_auth_cookie


router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=LoginResponse)
def login(
    request: LoginRequest,
    response: Response,
    db: Session = Depends(get_db)
):
    """Login with login_id and password. Rate limit is enforced by nginx
    `limit_req_zone login_limit` — see frontend/nginx.conf."""
    user = authenticate_user(db, request.login_id, request.password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
        )

    # Create token and set cookie
    token = create_access_token(str(user.id), user.is_admin)
    set_auth_cookie(response, token)

    # Get algorithm_config and ui_config from user's group
    algorithm_config = None
    ui_config = None
    if user.user_group:
        algorithm_config = user.user_group.algorithm_config
        ui_config = user.user_group.ui_config

    return LoginResponse(
        user=UserResponse(
            id=user.id,
            login_id=user.login_id,
            is_admin=user.is_admin,
            user_group_id=user.user_group_id,
            algorithm_config=algorithm_config,
            ui_config=ui_config,
        )
    )


@router.post("/logout")
def logout(response: Response):
    """Logout and clear cookie."""
    clear_auth_cookie(response)
    return {"message": "Logged out successfully"}


@router.get("/me", response_model=UserResponse)
def get_me(current_user: User = Depends(get_current_user)):
    """Get current user info."""
    algorithm_config = None
    ui_config = None
    if current_user.user_group:
        algorithm_config = current_user.user_group.algorithm_config
        ui_config = current_user.user_group.ui_config

    return UserResponse(
        id=current_user.id,
        login_id=current_user.login_id,
        is_admin=current_user.is_admin,
        user_group_id=current_user.user_group_id,
        algorithm_config=algorithm_config,
        ui_config=ui_config,
    )
