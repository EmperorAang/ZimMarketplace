using Microsoft.AspNetCore.SignalR;

namespace ZimMarketplace.API.Hubs
{
    public class AuctionHub : Hub
    {
        public Task JoinItemRoom(string itemId) =>
            Groups.AddToGroupAsync(Context.ConnectionId, $"item-{itemId}");

        public Task LeaveItemRoom(string itemId) =>
            Groups.RemoveFromGroupAsync(Context.ConnectionId, $"item-{itemId}");
    }
}