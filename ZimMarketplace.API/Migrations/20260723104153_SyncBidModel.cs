using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ZimMarketplace.API.Migrations
{
    /// <inheritdoc />
    public partial class SyncBidModel : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateIndex(
                name: "IX_Bids_BidderId",
                table: "Bids",
                column: "BidderId");

            migrationBuilder.AddForeignKey(
                name: "FK_Bids_Users_BidderId",
                table: "Bids",
                column: "BidderId",
                principalTable: "Users",
                principalColumn: "Id",
                onDelete: ReferentialAction.Cascade);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_Bids_Users_BidderId",
                table: "Bids");

            migrationBuilder.DropIndex(
                name: "IX_Bids_BidderId",
                table: "Bids");
        }
    }
}
